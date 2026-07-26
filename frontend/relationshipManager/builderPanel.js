// Middle panel: the persistent relationship-builder wizard. Unlike
// relationshipDialog.js (a showModal Promise-based popup bound to exactly one
// source/target pair), this panel is always mounted, drives its state from
// state.relationshipManager.builder, and supports N selected sources at once
// (bulk mode collapses to the N=1 case with no separate code path). Reuses
// relationshipDialog.js's exported constants/labels rather than redefining
// them, and relationshipValidator.js/relationshipMutations.js for all actual
// validation/mutation - this module only owns wizard-step orchestration.
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { validateRelationship } from '../relationshipValidator.js';
import { applyRelationship } from '../relationshipMutations.js';
import { searchMembers, buildMemberSearchIndex, getRelativesSummary } from '../memberSearch.js';
import { TYPE_OPTIONS, PARENT_SUBTYPES, SIBLING_SUBTYPES, toLabel, describeRelationship, getTypeHelp } from '../relationshipDialog.js';
import { suggestMatches } from './suggestions.js';
import { recordRecentMember, recordRecentType, getRecentMembers, getRecentTypes } from './recentContext.js';
import { pushCommand } from './undoStack.js';
import { showToast } from '../ui.js';

function resetBuilder(builder) {
  builder.step = 'select-target';
  builder.targetId = null;
  builder.type = null;
  builder.subtype = null;
  builder.marriageDate = '';
  builder.divorceDate = '';
  builder.status = 'current';
  builder.targetSearchQuery = '';
  builder.targetSearchResults = [];
  builder.perItemResults = [];
  builder.coParentId = null;
  builder.coParentResults = [];
  builder.linkSourceToTargetParents = false;
  builder.linkTargetToSourceParents = false;
  builder.siblingParentResults = [];
}

// Determines whose spouse(s) could plausibly also be the other parent of the
// child(ren) being linked here, so the Options step can offer it as an
// explicit, confirmable choice rather than leaving it to be discovered later
// as an unlabeled "complete the couple" placeholder in the focused tree (or,
// worse, silently assumed). Only offered for the two unambiguous shapes:
// type 'parent' (target is the one parent, every source is a child), or type
// 'child' with exactly one source (that source is the one parent, target is
// the child) - bulk 'child' (multiple sources becoming parents of one
// target) already links multiple parents directly in one action, so there's
// nothing left to suggest.
export function getCoParentContext(data, sourceIds, targetId, type) {
  const byId = new Map(data.map((d) => [d.id, d]));
  let parentId;
  let childIds;
  if (type === 'parent') {
    parentId = targetId;
    childIds = sourceIds;
  } else if (type === 'child' && sourceIds.length === 1) {
    parentId = sourceIds[0];
    childIds = [targetId];
  } else {
    return null;
  }
  const parent = byId.get(parentId);
  if (!parent) return null;
  // Excludes to_add ghosts (the family-chart library's own render-time
  // "complete the couple" placeholders, which can end up mixed into this
  // same data array) - only a real, already-existing spouse is worth
  // suggesting.
  const spouses = (parent.rels.spouses || []).map((id) => byId.get(id)).filter((d) => d && !d.to_add);
  if (!spouses.length) return null;
  return { parentId, parentLabel: toLabel(parent), childIds, spouses };
}

// Mirrors computeBulkPreview but for the optional co-parent link: each
// childId gets linked to coParentId as an additional 'parent' edge,
// regardless of the main relationship's own type/direction (the co-parent is
// always becoming a parent of the child, never the reverse).
export function computeCoParentPreview(data, childIds, coParentId) {
  if (!coParentId) return [];
  const byId = new Map(data.map((d) => [d.id, d]));
  return childIds.map((childId) => {
    const check = validateRelationship(data, childId, coParentId, 'parent');
    return { sourceId: childId, label: toLabel(byId.get(childId)), valid: check.valid, reason: check.reason };
  });
}

// The data model has no direct sibling edge (see relationshipMutations.js
// module comment) - the only way a sibling link becomes visible in the tree
// is by both people sharing a parent. This finds the existing parent(s) to
// offer linking the other person to. Deliberately surfaces *all* of a side's
// existing parents together (not one at a time): linking to only one parent
// of an existing couple leaves that person with a single recorded parent,
// which triggers the family-chart library's own "single_parent_empty_card"
// placeholder (an auto-generated to_add ghost labeled "ADD" - see
// src/renderers/card-html.ts) - linking to the whole existing couple at once
// avoids creating that half-finished state. Only offered for the unambiguous
// one-to-one case (a single selected source) - bulk sibling linking falls
// back to the relMeta-only annotation. Returns null if there's nothing to
// offer (no parents on either side, or they already share one and are
// therefore already visible siblings).
export function getSiblingParentContext(data, sourceIds, targetId) {
  if (sourceIds.length !== 1) return null;
  const byId = new Map(data.map((d) => [d.id, d]));
  const source = byId.get(sourceIds[0]);
  const target = byId.get(targetId);
  if (!source || !target) return null;

  const sourceParents = source.rels.parents || [];
  const targetParents = target.rels.parents || [];
  if (sourceParents.some((id) => targetParents.includes(id))) return null;

  const sourceMissingParents = targetParents.filter((id) => !sourceParents.includes(id)).map((id) => ({ id, label: toLabel(byId.get(id)) }));
  const targetMissingParents = sourceParents.filter((id) => !targetParents.includes(id)).map((id) => ({ id, label: toLabel(byId.get(id)) }));
  if (!sourceMissingParents.length && !targetMissingParents.length) return null;

  return {
    sourceId: source.id,
    targetId: target.id,
    sourceLabel: toLabel(source),
    targetLabel: toLabel(target),
    sourceMissingParents,
    targetMissingParents,
  };
}

// Mirrors computeCoParentPreview but for the sibling flow: links source to
// every one of target's existing parents (and/or target to every one of
// source's), per the two independent toggles - one row per resulting
// parent/child edge, so a couple's two parents both get linked in one action
// rather than forcing a pick-one choice.
export function computeSiblingParentPreview(data, ctx, { linkSourceToTargetParents = false, linkTargetToSourceParents = false } = {}) {
  if (!ctx) return [];
  const byId = new Map(data.map((d) => [d.id, d]));
  const rows = [];
  if (linkSourceToTargetParents) {
    ctx.sourceMissingParents.forEach(({ id: parentId, label: parentLabel }) => {
      const check = validateRelationship(data, ctx.sourceId, parentId, 'parent');
      rows.push({ sourceId: ctx.sourceId, parentId, label: toLabel(byId.get(ctx.sourceId)), parentLabel, valid: check.valid, reason: check.reason });
    });
  }
  if (linkTargetToSourceParents) {
    ctx.targetMissingParents.forEach(({ id: parentId, label: parentLabel }) => {
      const check = validateRelationship(data, ctx.targetId, parentId, 'parent');
      rows.push({ sourceId: ctx.targetId, parentId, label: toLabel(byId.get(ctx.targetId)), parentLabel, valid: check.valid, reason: check.reason });
    });
  }
  return rows;
}

// Pure: computes per-source validity for the chosen target/type. Bulk mode
// is just this list having length > 1 - preview rendering and commit both
// operate uniformly over it regardless of selection size.
export function computeBulkPreview(data, sourceIds, targetId, type) {
  const byId = new Map(data.map((d) => [d.id, d]));
  return sourceIds.map((sourceId) => {
    const check = validateRelationship(data, sourceId, targetId, type);
    return {
      sourceId,
      label: toLabel(byId.get(sourceId)),
      valid: check.valid,
      reason: check.reason,
    };
  });
}

// Family-tree ancestry only ever links a blood/adoptive child to a parent -
// a child's spouse is never a direct parent/child edge (see the module
// comment in relationshipMutations.js). If two selected sources are married
// to each other and the user is about to bulk-apply Parent/Child to both,
// one of them is almost certainly joining by marriage, not birth - flag it
// so the couple doesn't both get recorded as the parent's blood children.
export function findInLawWarnings(data, sourceIds, type) {
  if (type !== 'parent' && type !== 'child') return [];
  const byId = new Map(data.map((d) => [d.id, d]));
  const sourceSet = new Set(sourceIds);
  const warnings = [];
  const seen = new Set();

  sourceIds.forEach((id) => {
    if (seen.has(id)) return;
    const datum = byId.get(id);
    const marriedSelectedSpouseId = (datum?.rels?.spouses || []).find((spouseId) => sourceSet.has(spouseId));
    if (!marriedSelectedSpouseId) return;
    seen.add(id);
    seen.add(marriedSelectedSpouseId);
    warnings.push({ aId: id, bId: marriedSelectedSpouseId });
  });

  return warnings;
}

function renderBuilderHeader(rm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const sourceLabels = rm.selectedSourceIds.map((id) => escapeHtml(toLabel(byId.get(id)))).join(', ');
  const targetLabel = escapeHtml(toLabel(byId.get(rm.builder.targetId)));
  return `<p class="rm-builder-selection"><strong>${sourceLabels}</strong> &rarr; <strong>${targetLabel}</strong></p>`;
}

function typeAvailability(data, sourceIds, targetId) {
  // A type is selectable if valid for at least one selected source - full
  // per-source pass/fail is decided later in the preview step. When none are
  // valid, carries the first source's reason too, so the disabled option can
  // explain itself instead of just graying out with no explanation.
  const availability = {};
  TYPE_OPTIONS.forEach(({ type }) => {
    const checks = sourceIds.map((sourceId) => validateRelationship(data, sourceId, targetId, type));
    const validCheck = checks.find((c) => c.valid);
    availability[type] = { enabled: Boolean(validCheck), reason: validCheck ? undefined : checks[0]?.reason };
  });
  return availability;
}

// Rendered into #rm-target-results-wrap, a container separate from the
// search <input> itself. The input listener below updates only this
// container's innerHTML on every keystroke - re-rendering the whole step
// (including the input) would recreate the input element and drop focus/
// cursor position after every character typed.
function renderTargetResultsBlock(rm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const sources = rm.selectedSourceIds;

  const results = rm.builder.targetSearchResults;
  const resultsHtml = results.length
    ? `<div class="rm-target-results">${results
        .map((entry) => {
          const summary = getRelativesSummary(byId.get(entry.id), byId);
          return `
            <button type="button" class="rm-target-result" data-id="${escapeHtml(entry.id)}">
              <span class="rm-target-result-name">${escapeHtml(entry.label)}</span>
              ${summary ? `<span class="rm-target-result-detail">${escapeHtml(summary)}</span>` : ''}
            </button>
          `;
        })
        .join('')}</div>`
    : '';

  const suggestions = sources.length === 1 ? suggestMatches(byId.get(sources[0]), data) : [];
  const suggestionsHtml = suggestions.length
    ? `
      <div class="rm-suggestions">
        <span class="rm-suggestions-label">Suggested matches</span>
        <div class="rm-suggestion-list">
          ${suggestions
            .map(
              (s) => `
            <button type="button" class="rm-suggestion-chip" data-id="${escapeHtml(s.id)}" title="${escapeHtml(s.reasons.join(', '))}">
              ${escapeHtml(s.label)}
            </button>
          `,
            )
            .join('')}
        </div>
      </div>
    `
    : '';

  const recentMembers = getRecentMembers(rm.recent, data);
  const recentHtml = recentMembers.length
    ? `
      <div class="rm-recent">
        <span class="rm-suggestions-label">Recently selected</span>
        <div class="rm-suggestion-list">
          ${recentMembers
            .map((m) => `<button type="button" class="rm-recent-chip" data-id="${escapeHtml(m.id)}">${escapeHtml(toLabel(m))}</button>`)
            .join('')}
        </div>
      </div>
    `
    : '';

  return `${resultsHtml}${suggestionsHtml}${recentHtml}`;
}

function renderSelectTargetStep(rm, data) {
  const sources = rm.selectedSourceIds;
  if (sources.length === 0) {
    return `<p class="rm-builder-empty">Select one or more people from the left panel to start connecting them.</p>`;
  }

  const byId = new Map(data.map((d) => [d.id, d]));
  const sourceLabels = sources.map((id) => escapeHtml(toLabel(byId.get(id)))).join(', ');

  return `
    <p class="rm-builder-selection"><strong>${sourceLabels}</strong> ${sources.length > 1 ? `(${sources.length} people)` : ''}</p>
    <label class="search-box rm-search-box">
      ${icon('search')}
      <input type="text" id="rm-target-search-input" placeholder="Search existing member..." autocomplete="off" value="${escapeHtml(rm.builder.targetSearchQuery)}" />
    </label>
    <div id="rm-target-results-wrap">${renderTargetResultsBlock(rm, data)}</div>
  `;
}

function renderChooseTypeStep(rm, data) {
  const availability = typeAvailability(data, rm.selectedSourceIds, rm.builder.targetId);
  const byId = new Map(data.map((d) => [d.id, d]));
  const sourceLabel = rm.selectedSourceIds.map((id) => toLabel(byId.get(id))).join(', ');
  const targetLabel = toLabel(byId.get(rm.builder.targetId));
  const optionsHtml = TYPE_OPTIONS.map(({ type, label }, index) => {
    const { enabled, reason } = availability[type];
    const help = getTypeHelp(type, sourceLabel, targetLabel);
    const reasonHtml = enabled ? '' : `<span class="field-error">${escapeHtml(reason || 'Not allowed.')}</span>`;
    return `
      <label class="relationship-type-option ${enabled ? '' : 'is-disabled'}">
        <input type="radio" name="rm-rel-type" value="${type}" ${enabled ? '' : 'disabled'} />
        <span class="relationship-type-label">${index + 1}. ${label}</span>
        <span class="relationship-type-help">${escapeHtml(help)}</span>
        ${reasonHtml}
      </label>
    `;
  }).join('');

  const recentTypes = getRecentTypes(rm.recent);
  const recentHtml = recentTypes.length
    ? `
      <div class="rm-recent">
        <span class="rm-suggestions-label">Recently used</span>
        <div class="rm-suggestion-list">
          ${recentTypes
            .map((t) => `<button type="button" class="rm-recent-chip" data-type="${escapeHtml(t)}" ${availability[t].enabled ? '' : 'disabled'}>${escapeHtml(TYPE_OPTIONS.find((o) => o.type === t)?.label || t)}</button>`)
            .join('')}
        </div>
      </div>
    `
    : '';

  return `
    ${renderBuilderHeader(rm, data)}
    <form id="rm-type-form" class="stack">
      <div class="relationship-type-list" role="radiogroup" aria-label="Relationship type">${optionsHtml}</div>
      ${recentHtml}
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="rm-builder-back-btn">Back</button>
        <button type="submit" class="btn btn-primary" id="rm-type-next-btn" disabled>Next</button>
      </div>
    </form>
  `;
}

function renderCoParentPrompt(rm, data) {
  const { type, targetId } = rm.builder;
  const ctx = getCoParentContext(data, rm.selectedSourceIds, targetId, type);
  if (!ctx) return '';

  const childWord = ctx.childIds.length > 1 ? 'children' : 'child';
  return `
    <div class="rm-coparent-prompt">
      <p class="rm-coparent-label">${escapeHtml(ctx.parentLabel)} is already married to:</p>
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Also link as">
        <label class="relationship-subtype-option">
          <input type="radio" name="rm-coparent" value="" ${rm.builder.coParentId ? '' : 'checked'} />
          <span>Don't link an additional parent</span>
        </label>
        ${ctx.spouses
          .map(
            (sp) => `
          <label class="relationship-subtype-option">
            <input type="radio" name="rm-coparent" value="${escapeHtml(sp.id)}" ${rm.builder.coParentId === sp.id ? 'checked' : ''} />
            <span>Also link as ${escapeHtml(toLabel(sp))}'s ${childWord}</span>
          </label>
        `,
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderSiblingParentPrompt(rm, data) {
  const ctx = getSiblingParentContext(data, rm.selectedSourceIds, rm.builder.targetId);
  if (!ctx) return '';

  // Each option links to the *whole* existing parent couple at once (not one
  // parent at a time) - see the getSiblingParentContext module comment for
  // why picking only one parent is deliberately not offered.
  const sourceOption = ctx.sourceMissingParents.length
    ? `
      <label class="relationship-subtype-option">
        <input type="checkbox" name="rm-sibling-link-source" ${rm.builder.linkSourceToTargetParents ? 'checked' : ''} />
        <span>Also link ${escapeHtml(ctx.sourceLabel)} as child of ${escapeHtml(ctx.sourceMissingParents.map((p) => p.label).join(' and '))}</span>
      </label>
    `
    : '';
  const targetOption = ctx.targetMissingParents.length
    ? `
      <label class="relationship-subtype-option">
        <input type="checkbox" name="rm-sibling-link-target" ${rm.builder.linkTargetToSourceParents ? 'checked' : ''} />
        <span>Also link ${escapeHtml(ctx.targetLabel)} as child of ${escapeHtml(ctx.targetMissingParents.map((p) => p.label).join(' and '))}</span>
      </label>
    `
    : '';

  return `
    <div class="rm-coparent-prompt">
      <p class="rm-coparent-label">Link the existing parent(s) to make this visible in the tree:</p>
      <div class="stack">
        ${sourceOption}
        ${targetOption}
      </div>
    </div>
  `;
}

function renderOptionsStep(rm, data) {
  const { type, targetId } = rm.builder;
  const byId = new Map(data.map((d) => [d.id, d]));
  let fieldsHtml = '';
  if (type === 'parent' || type === 'child') {
    fieldsHtml = `
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Parent type">
        ${PARENT_SUBTYPES.map(
          ({ value, label }) => `
          <label class="relationship-subtype-option">
            <input type="radio" name="rm-rel-subtype" value="${value}" ${value === 'biological' ? 'checked' : ''} />
            <span>${label}</span>
          </label>
        `,
        ).join('')}
      </div>
      ${renderCoParentPrompt(rm, data)}
    `;
  } else if (type === 'spouse') {
    fieldsHtml = `
      <label>Marriage date<input type="date" name="marriageDate" /></label>
      <label>Divorce date<input type="date" name="divorceDate" /></label>
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Spouse status">
        <label class="relationship-subtype-option"><input type="radio" name="status" value="current" checked /><span>Current</span></label>
        <label class="relationship-subtype-option"><input type="radio" name="status" value="former" /><span>Former</span></label>
      </div>
    `;
  } else if (type === 'sibling') {
    const targetLabel = escapeHtml(toLabel(byId.get(targetId)));
    const sourceLabel = escapeHtml(rm.selectedSourceIds.map((id) => toLabel(byId.get(id))).join(', '));
    const siblingParentPrompt = renderSiblingParentPrompt(rm, data);
    const noteHtml = siblingParentPrompt
      ? `<p class="modal-message">Siblings aren't linked as a direct edge by themselves - check the option(s) below to make the connection visible in the tree, or leave them unchecked to record this as metadata only.</p>`
      : `<p class="modal-message">Siblings aren't linked as a direct edge in this tree, so the tree view won't change. If ${sourceLabel} and ${targetLabel} share a parent, link that parent to both of them instead for a complete tree.</p>`;
    fieldsHtml = `
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Sibling type">
        ${SIBLING_SUBTYPES.map(
          ({ value, label }) => `
          <label class="relationship-subtype-option">
            <input type="radio" name="rm-rel-subtype" value="${value}" ${value === 'full' ? 'checked' : ''} />
            <span>${label}</span>
          </label>
        `,
        ).join('')}
      </div>
      ${noteHtml}
      ${siblingParentPrompt}
    `;
  }

  return `
    ${renderBuilderHeader(rm, data)}
    <form id="rm-options-form" class="stack">
      ${fieldsHtml}
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="rm-builder-back-btn">Back</button>
        <button type="submit" class="btn btn-primary">Preview</button>
      </div>
    </form>
  `;
}

function renderPreviewStep(rm, data) {
  const { targetId, type, coParentId } = rm.builder;
  const byId = new Map(data.map((d) => [d.id, d]));
  const targetLabel = escapeHtml(toLabel(byId.get(targetId)));
  const relationshipLabel = escapeHtml(describeRelationship(rm.builder));
  const results = rm.builder.perItemResults;
  const coParentResults = rm.builder.coParentResults || [];
  const siblingParentResults = rm.builder.siblingParentResults || [];
  const validCount =
    results.filter((r) => r.valid).length + coParentResults.filter((r) => r.valid).length + siblingParentResults.filter((r) => r.valid).length;

  const inLawWarnings = findInLawWarnings(data, rm.selectedSourceIds, type);
  const warningHtml = inLawWarnings.length
    ? `
      <div class="rm-inlaw-warning">
        ${inLawWarnings
          .map(
            ({ aId, bId }) => `
          <p>
            <strong>${escapeHtml(toLabel(byId.get(aId)))}</strong> and <strong>${escapeHtml(toLabel(byId.get(bId)))}</strong> are married to each other.
            Only their actual blood/adoptive child should be recorded as ${escapeHtml(targetLabel)}'s ${type === 'child' ? 'child' : 'parent'} -
            the spouse who joined by marriage will already show up in the tree correctly without a direct link. Consider unchecking one of them and creating that link separately.
          </p>
        `,
          )
          .join('')}
      </div>
    `
    : '';

  const rowsHtml = results
    .map(
      (r) => `
      <div class="rm-bulk-preview-row ${r.valid ? '' : 'is-invalid'}">
        <span class="rm-bulk-preview-icon">${icon(r.valid ? 'check' : 'close')}</span>
        <span class="rm-bulk-preview-person">${escapeHtml(r.label)}</span>
        ${r.valid ? `<span class="relationship-preview-arrow">${relationshipLabel}</span><span class="rm-bulk-preview-person">${targetLabel}</span>` : `<span class="field-error">${escapeHtml(r.reason || 'Not allowed.')}</span>`}
      </div>
    `,
    )
    .join('');

  const coParentLabel = coParentId ? escapeHtml(toLabel(byId.get(coParentId))) : '';
  const coParentHtml = coParentResults.length
    ? `
      <p class="rm-builder-selection">Also link as <strong>${coParentLabel}</strong>'s child:</p>
      <div class="rm-bulk-preview">
        ${coParentResults
          .map(
            (r) => `
          <div class="rm-bulk-preview-row ${r.valid ? '' : 'is-invalid'}">
            <span class="rm-bulk-preview-icon">${icon(r.valid ? 'check' : 'close')}</span>
            <span class="rm-bulk-preview-person">${escapeHtml(r.label)}</span>
            ${r.valid ? `<span class="relationship-preview-arrow">Child of</span><span class="rm-bulk-preview-person">${coParentLabel}</span>` : `<span class="field-error">${escapeHtml(r.reason || 'Not allowed.')}</span>`}
          </div>
        `,
          )
          .join('')}
      </div>
    `
    : '';

  const siblingParentHtml = siblingParentResults.length
    ? `
      <p class="rm-builder-selection">Also link as child of the existing parent(s):</p>
      <div class="rm-bulk-preview">
        ${siblingParentResults
          .map(
            (r) => `
          <div class="rm-bulk-preview-row ${r.valid ? '' : 'is-invalid'}">
            <span class="rm-bulk-preview-icon">${icon(r.valid ? 'check' : 'close')}</span>
            <span class="rm-bulk-preview-person">${escapeHtml(r.label)}</span>
            ${r.valid ? `<span class="relationship-preview-arrow">Child of</span><span class="rm-bulk-preview-person">${escapeHtml(r.parentLabel)}</span>` : `<span class="field-error">${escapeHtml(r.reason || 'Not allowed.')}</span>`}
          </div>
        `,
          )
          .join('')}
      </div>
    `
    : '';

  return `
    ${warningHtml}
    <div class="rm-bulk-preview">${rowsHtml}</div>
    ${coParentHtml}
    ${siblingParentHtml}
    <div class="modal-actions row">
      <button type="button" class="btn btn-ghost" id="rm-builder-back-btn">Back</button>
      <button type="button" class="btn btn-primary" id="rm-builder-create-btn" ${validCount === 0 ? 'disabled' : ''}>
        ${validCount === 0 ? 'No valid relationships to create' : `Create ${validCount} relationship${validCount === 1 ? '' : 's'}`}
      </button>
    </div>
  `;
}

export function renderBuilderPanel(rm, data) {
  const { step } = rm.builder;
  let bodyHtml;
  if (step === 'select-target') bodyHtml = renderSelectTargetStep(rm, data);
  else if (step === 'choose-type') bodyHtml = renderChooseTypeStep(rm, data);
  else if (step === 'options') bodyHtml = renderOptionsStep(rm, data);
  else bodyHtml = renderPreviewStep(rm, data);

  const stepLabels = { 'select-target': 'Select Target', 'choose-type': 'Relationship Type', options: 'Additional Options', preview: 'Preview' };
  return `
    <div class="rm-panel-header">
      <h3>Relationship Builder</h3>
      <span class="rm-builder-step-label">${stepLabels[step]}</span>
    </div>
    <div class="rm-builder-body" id="rm-builder-body">${bodyHtml}</div>
  `;
}

function selectTarget(state, render, targetId) {
  const rm = state.relationshipManager;
  rm.builder.targetId = targetId;
  rm.builder.targetSearchResults = [];
  rm.builder.targetSearchQuery = '';
  rm.builder.step = 'choose-type';
  render();
}

function commit(state, render, onDirtyChange) {
  const rm = state.relationshipManager;
  const data = state.selectedTreeData;
  const { targetId, type, subtype, marriageDate, divorceDate, status, perItemResults, coParentId, coParentResults, siblingParentResults } = rm.builder;

  const validResults = perItemResults.filter((r) => r.valid);
  validResults.forEach(({ sourceId }) => {
    const draft = { sourceId, targetId, type, subtype, marriageDate: marriageDate || undefined, divorceDate: divorceDate || undefined, status: type === 'spouse' ? status : undefined };
    applyRelationship(data, draft);
    pushCommand(rm.undoStack, draft);
    recordRecentMember(rm.recent, sourceId);
  });
  recordRecentMember(rm.recent, targetId);
  recordRecentType(rm.recent, type);

  const validCoParentResults = (coParentResults || []).filter((r) => r.valid);
  validCoParentResults.forEach(({ sourceId }) => {
    const draft = { sourceId, targetId: coParentId, type: 'parent' };
    applyRelationship(data, draft);
    pushCommand(rm.undoStack, draft);
  });
  if (validCoParentResults.length) recordRecentMember(rm.recent, coParentId);

  const validSiblingParentResults = (siblingParentResults || []).filter((r) => r.valid);
  validSiblingParentResults.forEach(({ sourceId, parentId }) => {
    const draft = { sourceId, targetId: parentId, type: 'parent' };
    applyRelationship(data, draft);
    pushCommand(rm.undoStack, draft);
    recordRecentMember(rm.recent, parentId);
  });

  rm.dirty = true;

  const totalApplied = validResults.length + validCoParentResults.length + validSiblingParentResults.length;
  const totalAttempted = perItemResults.length + (coParentResults || []).length + (siblingParentResults || []).length;
  const skipped = totalAttempted - totalApplied;
  showToast(
    skipped > 0
      ? `Applied ${totalApplied} of ${totalAttempted} — ${skipped} skipped (already related).`
      : `Created ${totalApplied} relationship${totalApplied === 1 ? '' : 's'} — remember to save.`,
  );

  if (!rm.keepSelection) rm.selectedSourceIds = [];
  resetBuilder(rm.builder);
  onDirtyChange?.();
  render();
}

export function attachBuilderPanelListeners(state, render, onDirtyChange) {
  const rm = state.relationshipManager;
  const data = state.selectedTreeData;
  const { step } = rm.builder;

  document.querySelector('#rm-builder-back-btn')?.addEventListener('click', () => {
    if (step === 'choose-type') rm.builder.step = 'select-target';
    else if (step === 'options') rm.builder.step = 'choose-type';
    else if (step === 'preview') rm.builder.step = 'options';
    render();
  });

  if (step === 'select-target') {
    const input = document.querySelector('#rm-target-search-input');
    const resultsWrap = document.querySelector('#rm-target-results-wrap');

    const attachResultListeners = () => {
      resultsWrap?.querySelectorAll('.rm-target-result, .rm-suggestion-chip, .rm-recent-chip[data-id]').forEach((btn) => {
        btn.addEventListener('click', () => selectTarget(state, render, btn.dataset.id));
      });
    };

    input?.addEventListener('input', () => {
      rm.builder.targetSearchQuery = input.value;
      const index = buildMemberSearchIndex(data);
      rm.builder.targetSearchResults = searchMembers(index, input.value, 8).filter((entry) => !rm.selectedSourceIds.includes(entry.id));
      // Update only the results container, not the whole step - replacing
      // the <input> itself (via a full render()) would drop focus/cursor
      // position after every keystroke.
      if (resultsWrap) {
        resultsWrap.innerHTML = renderTargetResultsBlock(rm, data);
        attachResultListeners();
      }
    });

    attachResultListeners();
  }

  if (step === 'choose-type') {
    const form = document.querySelector('#rm-type-form');
    const nextBtn = document.querySelector('#rm-type-next-btn');
    form?.addEventListener('change', () => {
      nextBtn.disabled = !form.querySelector('input[name="rm-rel-type"]:checked');
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const checked = form.querySelector('input[name="rm-rel-type"]:checked');
      if (!checked) return;
      rm.builder.type = checked.value;
      rm.builder.step = 'options';
      render();
    });
    document.querySelectorAll('.rm-recent-chip[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        rm.builder.type = btn.dataset.type;
        rm.builder.step = 'options';
        render();
      });
    });
  }

  if (step === 'options') {
    const form = document.querySelector('#rm-options-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      rm.builder.subtype = formData.get('rm-rel-subtype') || null;
      rm.builder.marriageDate = formData.get('marriageDate') || '';
      rm.builder.divorceDate = formData.get('divorceDate') || '';
      rm.builder.status = formData.get('status') || 'current';
      rm.builder.coParentId = formData.get('rm-coparent') || null;
      rm.builder.linkSourceToTargetParents = formData.get('rm-sibling-link-source') === 'on';
      rm.builder.linkTargetToSourceParents = formData.get('rm-sibling-link-target') === 'on';
      rm.builder.perItemResults = computeBulkPreview(data, rm.selectedSourceIds, rm.builder.targetId, rm.builder.type);
      const ctx = getCoParentContext(data, rm.selectedSourceIds, rm.builder.targetId, rm.builder.type);
      rm.builder.coParentResults = rm.builder.coParentId ? computeCoParentPreview(data, ctx?.childIds || [], rm.builder.coParentId) : [];
      const siblingCtx = getSiblingParentContext(data, rm.selectedSourceIds, rm.builder.targetId);
      rm.builder.siblingParentResults = computeSiblingParentPreview(data, siblingCtx, {
        linkSourceToTargetParents: rm.builder.linkSourceToTargetParents,
        linkTargetToSourceParents: rm.builder.linkTargetToSourceParents,
      });
      rm.builder.step = 'preview';
      render();
    });
  }

  if (step === 'preview') {
    document.querySelector('#rm-builder-create-btn')?.addEventListener('click', () => commit(state, render, onDirtyChange));
  }
}
