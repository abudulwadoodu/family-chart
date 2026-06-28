// Shared layout for public legal/documentation pages (Terms & Conditions,
// Privacy Policy, and any future pages such as a Cookie Policy or FAQ).
// Presentation lives here; the actual copy lives in content.js so legal text
// can be edited without touching markup or behavior.
import { icon } from '../icons.js';
import { escapeHtml } from '../utils.js';

const WORDS_PER_MINUTE = 200;

function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, ' ');
}

function blockText(block) {
  if (block.type === 'p' || block.type === 'callout') return stripTags(block.html);
  if (block.type === 'list') return block.items.map(stripTags).join(' ');
  if (block.type === 'subheading') return block.text;
  return '';
}

function estimateReadingMinutes(sections) {
  const text = sections.map((section) => section.blocks.map(blockText).join(' ')).join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function renderBlock(block) {
  switch (block.type) {
    case 'p':
      return `<p class="legal-p">${block.html}</p>`;
    case 'subheading':
      return `<h3 class="legal-subheading">${escapeHtml(block.text)}</h3>`;
    case 'list':
      return `<ul class="legal-list">${block.items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
    case 'callout':
      return `
        <div class="legal-callout legal-callout-${block.tone}" role="note">
          <span class="legal-callout-tag">${block.tone === 'todo' ? 'TODO &mdash; Review Required' : 'Note'}</span>
          <p>${block.html}</p>
        </div>
      `;
    default:
      return '';
  }
}

function renderSection(section, index) {
  return `
    <section class="legal-section" id="${section.id}">
      <h2 class="legal-section-title"><span class="legal-section-number">${index + 1}.</span> ${escapeHtml(section.title)}</h2>
      ${section.blocks.map(renderBlock).join('')}
    </section>
  `;
}

function renderToc(sections) {
  return sections
    .map(
      (section, index) =>
        `<li><a href="#${section.id}" class="legal-toc-link" data-target="${section.id}">${index + 1}. ${escapeHtml(section.title)}</a></li>`
    )
    .join('');
}

function renderRevisionHistory(versionHistory) {
  if (!versionHistory?.length) return '';
  const rows = versionHistory
    .slice()
    .reverse()
    .map(
      (entry) => `
        <li>
          <span class="legal-revision-version">v${escapeHtml(entry.version)}</span>
          <span class="legal-revision-date">${escapeHtml(entry.date)}</span>
          <span class="legal-revision-summary">${escapeHtml(entry.summary)}</span>
        </li>
      `
    )
    .join('');

  return `
    <section class="legal-revision-history" aria-label="Revision history">
      <h2 class="legal-section-title">Revision History</h2>
      <ul>${rows}</ul>
    </section>
  `;
}

export function renderLegalPageMarkup(doc) {
  const readingMinutes = estimateReadingMinutes(doc.sections);

  return `
    <article class="legal-page" data-doc="${doc.slug}">
      <div class="legal-progress-track" aria-hidden="true"><div class="legal-progress-bar" id="legal-progress-bar"></div></div>
      <header class="legal-header">
        <h1 class="legal-title">${escapeHtml(doc.title)}</h1>
        <div class="legal-meta">
          <span class="legal-meta-item">Version ${escapeHtml(doc.version)}</span>
          <span class="legal-meta-sep" aria-hidden="true">&middot;</span>
          <span class="legal-meta-item">Last updated <time datetime="${doc.lastUpdatedISO}">${escapeHtml(doc.lastUpdatedLabel)}</time></span>
          <span class="legal-meta-sep" aria-hidden="true">&middot;</span>
          <span class="legal-meta-item">${icon('clock')} ${readingMinutes} min read</span>
        </div>
        <p class="legal-intro">${escapeHtml(doc.intro)}</p>
      </header>
      <div class="legal-body">
        <nav class="legal-toc" aria-label="Table of contents">
          <p class="legal-toc-title">${icon('list')} On this page</p>
          <ol>${renderToc(doc.sections)}</ol>
        </nav>
        <div class="legal-sections">
          ${doc.sections.map((section, index) => renderSection(section, index)).join('')}
          ${renderRevisionHistory(doc.versionHistory)}
        </div>
      </div>
      <button type="button" id="legal-back-to-top" class="legal-back-to-top" aria-label="Back to top">${icon('arrowUp')}</button>
    </article>
  `;
}

function setMetaTag(attr, value, content) {
  let tag = document.querySelector(`meta[${attr}="${value}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, value);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(path) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', `${window.location.origin}${path}`);
}

function applySeo(doc) {
  document.title = `${doc.title} - Family Chart`;
  setMetaTag('name', 'description', doc.seoDescription);
  setMetaTag('property', 'og:title', `${doc.title} - Family Chart`);
  setMetaTag('property', 'og:description', doc.seoDescription);
  setMetaTag('property', 'og:type', 'website');
  setMetaTag('property', 'og:url', `${window.location.origin}${doc.path}`);
  setCanonical(doc.path);
}

// Resets the document title and removes the SEO tags set above once the
// user navigates away from a legal page, so they don't linger and describe
// the wrong screen (e.g. the dashboard claiming the Terms canonical URL).
export function clearLegalSeo(defaultTitle) {
  document.title = defaultTitle;
  document.querySelector('link[rel="canonical"]')?.remove();
  ['description'].forEach((name) => document.querySelector(`meta[name="${name}"]`)?.remove());
  ['og:title', 'og:description', 'og:type', 'og:url'].forEach((prop) => document.querySelector(`meta[property="${prop}"]`)?.remove());
}

// Re-mounting the same legal page (e.g. when the auth bootstrap re-renders
// after this page is already showing) would otherwise stack a second
// scroll listener/observer on `window` on top of the first - tracked here so
// each mount tears down the previous one before attaching its own.
let cleanupPreviousMount = null;

export function attachLegalPageListeners(doc) {
  cleanupPreviousMount?.();
  applySeo(doc);

  const root = document.querySelector('.legal-page');
  if (!root) return;

  const tocLinks = Array.from(root.querySelectorAll('.legal-toc-link'));
  const sections = Array.from(root.querySelectorAll('.legal-section'));
  const progressBar = document.querySelector('#legal-progress-bar');
  const backToTopBtn = document.querySelector('#legal-back-to-top');

  const handleTocClick = (event) => {
    const link = event.target.closest('.legal-toc-link');
    if (!link) return;
    const target = document.getElementById(link.dataset.target);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `${doc.path}#${link.dataset.target}`);
  };
  root.querySelector('.legal-toc')?.addEventListener('click', handleTocClick);

  const onScroll = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
    if (progressBar) progressBar.style.width = `${pct}%`;
    backToTopBtn?.classList.toggle('legal-back-to-top-visible', scrollTop > 480);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const handleBackToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  backToTopBtn?.addEventListener('click', handleBackToTop);

  let activeId = sections[0]?.id || null;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activeId = entry.target.id;
      });
      tocLinks.forEach((link) => link.classList.toggle('legal-toc-link-active', link.dataset.target === activeId));
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
  );
  sections.forEach((section) => observer.observe(section));

  if (window.location.hash) {
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }

  cleanupPreviousMount = () => {
    root.querySelector('.legal-toc')?.removeEventListener('click', handleTocClick);
    window.removeEventListener('scroll', onScroll);
    backToTopBtn?.removeEventListener('click', handleBackToTop);
    observer.disconnect();
  };
}
