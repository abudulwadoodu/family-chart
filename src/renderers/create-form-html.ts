import { EditDatumFormCreator, NewRelFormCreator, SelectField } from '../types/form'
import * as icons from './icons'


export function getHtmlNew(form_creator: NewRelFormCreator) {
  // link_mode forms (opened via "Link existing member") only offer the
  // existing-member picker below - the create-new fields/gender radio and
  // Submit button are for the "Add relative" flow and would otherwise let
  // a linking user accidentally create a brand new person instead.
  if (form_creator.link_mode) {
    return (`
      <form id="familyForm" class="f3-form">
        ${closeBtn()}
        <h3 class="f3-form-title">${form_creator.title}</h3>

        ${form_creator.linkExistingRelative ? addLinkExistingRelative(form_creator) : ''}

        <div class="f3-form-buttons">
          <button type="button" class="f3-cancel-btn">Cancel</button>
        </div>
      </form>
    `)
  }

  return (`
    <form id="familyForm" class="f3-form">
      ${closeBtn()}
      <h3 class="f3-form-title">${form_creator.title}</h3>
      ${genderRadio(form_creator)}

      ${fields(form_creator)}

      <div class="f3-form-buttons">
        <button type="button" class="f3-cancel-btn">Cancel</button>
        <button type="submit">Submit</button>
      </div>

      ${form_creator.linkExistingRelative ? addLinkExistingRelative(form_creator) : ''}
    </form>
  `)
}

export function getHtmlEdit(form_creator: EditDatumFormCreator) {
  return (`
    <form id="familyForm" class="f3-form ${form_creator.editable ? '' : 'non-editable'}">
      <div class="f3-form-header">
        ${closeBtn()}
        <div class="f3-form-header-name">${displayName(form_creator)}</div>
        ${avatarFrame(form_creator)}
      </div>

      <div class="f3-form-action-row">
        ${!form_creator.no_edit ? addRelativeBtn(form_creator) : ''}
        ${form_creator.no_edit ? '' : editBtn(form_creator)}
        ${form_creator.no_edit ? '' : removeRelativeBtn(form_creator)}
        ${form_creator.no_edit ? '' : deleteBtn(form_creator)}
      </div>

      <div class="f3-form-body">
        ${genderRadio(form_creator)}

        ${fields(form_creator)}

        ${form_creator.linkExistingRelative ? addLinkExistingRelative(form_creator) : ''}
      </div>

      <div class="f3-form-buttons">
        <button type="button" class="f3-cancel-btn">Cancel</button>
        <button type="submit">Save and close</button>
      </div>
    </form>
  `)


}

function displayName(form_creator: EditDatumFormCreator) {
  const name = form_creator.fields
    .filter(field => field.id === 'first name' || field.id === 'last name')
    .map(field => field.initial_value)
    .filter(Boolean)
    .join(' ')
  return name || 'Unnamed'
}

function avatarFrame(form_creator: EditDatumFormCreator) {
  const avatar_field = form_creator.fields.find(field => field.id === 'avatar')
  const avatar_url = avatar_field?.initial_value
  return (`
    <div class="f3-form-avatar-frame">
      ${avatar_url
        ? `<img class="f3-form-avatar-img" data-avatar-src="${avatar_url}" alt="${displayName(form_creator)}">`
        : `<div class="f3-form-avatar-placeholder">${displayName(form_creator).slice(0, 1).toUpperCase()}</div>`}
    </div>
  `)
}

function deleteBtn(form_creator: EditDatumFormCreator) {
  return (`
    <button type="button" class="f3-action-btn f3-delete-btn" title="Delete" ${form_creator.can_delete ? '' : 'disabled'}>
      ${icons.trashSvgIcon()}
    </button>
  `)
}

function removeRelativeBtn(form_creator: EditDatumFormCreator) {
  return (`
    <button type="button" class="f3-action-btn f3-remove-relative-btn${form_creator.removeRelativeActive ? ' active' : ''}" title="${form_creator.removeRelativeActive ? 'Cancel remove relation' : 'Remove relation'}">
      ${icons.linkOffSvgIcon()}
    </button>
  `)
}

function addRelativeBtn(form_creator: EditDatumFormCreator) {
  return (`
    <button type="button" class="f3-action-btn f3-add-relative-btn" title="Add relative">
      ${form_creator.addRelativeActive ? icons.userPlusCloseSvgIcon() : icons.userPlusSvgIcon()}
    </button>
  `)
}

function editBtn(form_creator: EditDatumFormCreator) {
  return (`
    <button type="button" class="f3-action-btn f3-edit-btn" title="${form_creator.editable ? 'Stop editing' : 'Edit'}">
      ${form_creator.editable ? icons.pencilOffSvgIcon() : icons.pencilSvgIcon()}
    </button>
  `)
}

function genderRadio(form_creator: EditDatumFormCreator | NewRelFormCreator) {
  if (!form_creator.editable) return ''
  return (`
    <div class="f3-radio-group">
      ${form_creator.gender_field.options.map(option => (`
        <label>
          <input type="radio" name="${form_creator.gender_field.id}" 
            value="${option.value}" 
            ${option.value === form_creator.gender_field.initial_value ? 'checked' : ''}
            ${form_creator.gender_field.disabled ? 'disabled' : ''}
          >
          ${option.label}
        </label>
      `)).join('')}
    </div>
  `)
}

function fields(form_creator: EditDatumFormCreator | NewRelFormCreator) {
  if (!form_creator.editable) return infoField()
  let fields_html = ''
  form_creator.fields.forEach(field => {
    if (field.id === 'avatar') return
    if (field.type === 'text') {
      fields_html += `
      <div class="f3-form-field" data-field-id="${field.id}">
        <label>${field.label}</label>
        <input type="${field.type}"
          name="${field.id}"
          value="${field.initial_value || ''}"
          placeholder="${field.label}">
      </div>`
    } else if (field.type === 'date') {
      fields_html += `
      <div class="f3-form-field f3-form-field-date" data-field-id="${field.id}">
        <label>${field.label}</label>
        <div class="f3-date-input-wrap">
          <input type="text"
            class="f3-date-text-input"
            name="${field.id}"
            value="${field.initial_value || ''}"
            placeholder="${field.placeholder || 'YYYY-MM-DD'}"
            pattern="\\d{4}-\\d{2}-\\d{2}"
            inputmode="numeric"
            maxlength="10"
            autocomplete="off">
          <input type="date"
            class="f3-date-picker-input"
            tabindex="-1"
            aria-hidden="true"
            value="${/^\d{4}-\d{2}-\d{2}$/.test(field.initial_value || '') ? field.initial_value : ''}">
          <button type="button" class="f3-date-picker-btn" title="Pick a date" aria-label="Pick a date for ${field.label}">
            ${icons.calendarSvgIcon()}
          </button>
        </div>
      </div>`
    } else if (field.type === 'textarea') {
      fields_html += `
      <div class="f3-form-field" data-field-id="${field.id}">
        <label>${field.label}</label>
        <textarea name="${field.id}"
          placeholder="${field.label}">${field.initial_value || ''}</textarea>
      </div>`
    } else if (field.type === 'select') {
      const select_field = field as SelectField
      fields_html += `
      <div class="f3-form-field" data-field-id="${field.id}">
        <label>${select_field.label}</label>
        <select name="${select_field.id}" value="${select_field.initial_value || ''}">
          <option value="">${select_field.placeholder || `Select ${select_field.label}`}</option>
          ${select_field.options.map((option) => `<option ${option.value === select_field.initial_value ? 'selected' : ''} value="${option.value}">${option.label}</option>`).join('')}
        </select>
      </div>`
    } else if (field.type === 'rel_reference') {
      fields_html += `
      <div class="f3-form-field" data-field-id="${field.id}">
        <label>${field.label} - <i>${field.rel_label}</i></label>
        <input type="text"
          name="${field.id}"
          value="${field.initial_value || ''}"
          placeholder="${field.label}">
      </div>`
    }
  })
  fields_html += avatarField(form_creator)
  return fields_html

  function infoField() {
    let fields_html = ''
    form_creator.fields.forEach(field => {
      if (field.id === 'first name' || field.id === 'last name') return
      if (field.type === 'rel_reference') {
        if (!field.initial_value) return
        fields_html += `
        <div class="f3-info-field" data-field-id="${field.id}">
          <span class="f3-info-field-label">${field.label} - <i>${field.rel_label}</i></span>
          <span class="f3-info-field-value">${field.initial_value || ''}</span>
        </div>`
      } else if (field.type === 'select') {
        const select_field = field as SelectField
        if (!field.initial_value) return
        fields_html += `
        <div class="f3-info-field" data-field-id="${field.id}">
          <span class="f3-info-field-label">${select_field.label}</span>
          <span class="f3-info-field-value">${select_field.options.find(option => option.value === select_field.initial_value)?.label || ''}</span>
        </div>`
      } else {
        fields_html += `
        <div class="f3-info-field" data-field-id="${field.id}">
          <span class="f3-info-field-label">${field.label}</span>
          <span class="f3-info-field-value">${field.initial_value || ''}</span>
        </div>`
      }
    })
    return fields_html
  }
}

function avatarField(form_creator: EditDatumFormCreator | NewRelFormCreator) {
  const avatar_field = form_creator.fields.find(field => field.id === 'avatar')
  if (!avatar_field) return ''
  return (`
    <div class="f3-form-field f3-form-field-photo-url" data-field-id="avatar">
      <label>${avatar_field.label}</label>
      <input type="text"
        name="avatar"
        value="${avatar_field.initial_value || ''}"
        placeholder="${avatar_field.label}">
      <a href="#" class="f3-upload-link">Upload</a>
    </div>
  `)
}

function addLinkExistingRelative(form_creator: EditDatumFormCreator | NewRelFormCreator) {
  const title = form_creator.linkExistingRelative.hasOwnProperty('title') ? form_creator.linkExistingRelative.title : 'Profile already exists?'
  const select_placeholder = form_creator.linkExistingRelative.hasOwnProperty('select_placeholder') ? form_creator.linkExistingRelative.select_placeholder : 'Select profile'
  const options = form_creator.linkExistingRelative.options as SelectField['options']
  return (`
    <div>
      <hr>
      <div class="f3-link-existing-relative">
        <label>${title}</label>
        <select>
          <option value="">${select_placeholder}</option>
          ${options.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
        </select>
      </div>
    </div>
  `)
}


function closeBtn() {
  return (`
    <span class="f3-close-btn" title="Close">
      ${icons.closeSvgIcon()}
    </span>
  `)
}
