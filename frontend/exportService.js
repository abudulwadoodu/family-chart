// ExportService renders the family tree visualization (not just the current
// viewport) to a static image, independent of the tree/toolbar UI. Adding a
// new format later (e.g. exportAsSVG) means adding a function here - nothing
// in main.js/components.js should need to know how rasterization works.
//
// Approach: clone the tree's DOM into an off-screen container instead of
// touching the live, on-screen tree. Three things make this necessary rather
// than just screenshotting `#f3Canvas` in place:
//   1. Person cards live in a plain `<div>` (`#htmlSvg .cards_view`) that's a
//      sibling of the `<svg>`, not inside it (see src/renderers/html.ts) -
//      the SVG and its connectors are only half the picture.
//   2. `#f3Canvas` and its `.chart-container` ancestor clip with
//      `overflow: hidden` at the current viewport size, and pan/zoom is a
//      CSS transform - so most of a large tree is never in the live DOM's
//      visible bounds at all.
//   3. All theme colors (card fill colors, box-sizing, etc.) are CSS custom
//      properties scoped to the `.f3` element (see src/styles/family-chart.css),
//      not `#f3Canvas` itself - the clone must keep `.f3` as part of its own
//      subtree, or every `var(--*-color)` resolves to nothing once reparented
//      onto document.body with no `.f3` ancestor.
// Cloning means the live tree is never resized, reflowed, or reparented to
// produce an export, so the user's zoom/pan/selection can't be disturbed -
// there is simply nothing to restore afterward.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const DEFAULT_MARGIN = 48;
const DEFAULT_RASTER_SCALE = 2;
const OFFSCREEN_LEFT = -100000;
const EXPORT_LINK_COLOR = '#333333';

class ExportCancelledError extends Error {}

function findCanvas(root) {
  const canvas = root.querySelector('#f3Canvas');
  if (!canvas) throw new Error('Tree canvas not found.');
  return canvas;
}

function getCanvasLayers(canvas) {
  const view = canvas.querySelector('svg .view');
  const cardsView = canvas.querySelector('#htmlSvg .cards_view');
  if (!view || !cardsView) throw new Error('Tree layers not found.');
  return { view, cardsView };
}

// Connectors are drawn with a hardcoded white stroke (see src/renderers/view-links.ts)
// so they show up against the app's normal dark canvas background. The export
// uses a white background instead (for printing/sharing), so white-on-white
// links would otherwise vanish - force a dark stroke for the export only.
function darkenLinksForExport(canvas) {
  canvas.querySelectorAll('.links_view path.link').forEach((path) => {
    path.setAttribute('stroke', EXPORT_LINK_COLOR);
    path.style.stroke = EXPORT_LINK_COLOR;
  });
}

// html2canvas's native <svg> support is unreliable for this nested,
// transform-heavy SVG (connector paths silently fail to render, and its
// foreignObjectRendering mode blanks the capture entirely - likely tripped up
// by the remote avatar <img>s inside the sibling HTML card layer). Rasterize
// the connectors ourselves via the browser's native SVG-to-image conversion
// instead of asking html2canvas to do it, then composite that image
// underneath the html2canvas-rendered HTML cards.
async function rasterizeSvgLayer(svgEl, { x, y, width, height, scale }) {
  const clonedSvg = svgEl.cloneNode(true);
  clonedSvg.setAttribute('width', String(width));
  clonedSvg.setAttribute('height', String(height));
  clonedSvg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);

  const svgString = new XMLSerializer().serializeToString(clonedSvg);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to rasterize connector lines.'));
    img.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// html2canvas always paints its capture area with an opaque white
// background, regardless of the `backgroundColor` option passed (confirmed
// by sampling: passing null/transparent still yields alpha=255 white pixels
// everywhere nothing else was drawn) - so a plain drawImage-based composite
// would just paint over the connectors layer underneath. Chroma-key the
// cards layer instead: punch out pure opaque white pixels (the untouched
// background) so what's left behind - card backgrounds, borders, text,
// photos - can be composited over the connectors layer cleanly. None of
// this app's card themes use a pure white fill, so this doesn't clip any
// real card content.
function makeWhiteTransparent(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Builds an off-screen, unclipped, zoom-reset clone of the tree so its full
 * extent can be measured and rasterized without touching the live tree.
 * Clones `container` itself (the `.f3` element), not just `#f3Canvas`, so
 * every CSS rule/custom-property scoped to `.f3` still applies inside the
 * clone's own subtree once it's detached and reparented onto document.body.
 */
function buildOffscreenClone(container) {
  const clone = container.cloneNode(true);
  clone.style.position = 'fixed';
  clone.style.top = '0';
  clone.style.left = `${OFFSCREEN_LEFT}px`;
  clone.style.overflow = 'visible';
  clone.style.width = 'max-content';
  clone.style.height = 'max-content';
  // No background color here: the cards layer is rasterized with a
  // transparent background so it can be composited over the connectors
  // layer (see renderFullTreeToCanvas) - white is filled in at that point.
  clone.style.background = 'transparent';

  const cloneCanvas = findCanvas(clone);
  cloneCanvas.style.overflow = 'visible';
  cloneCanvas.style.width = 'max-content';
  cloneCanvas.style.height = 'max-content';
  cloneCanvas.style.background = 'transparent';

  const cloneLayers = getCanvasLayers(cloneCanvas);
  cloneLayers.view.style.transform = 'translate(0px, 0px) scale(1)';
  cloneLayers.cardsView.style.transform = 'translate(0px, 0px) scale(1)';
  darkenLinksForExport(cloneCanvas);

  const cloneSvg = cloneCanvas.querySelector('svg.main_svg');
  if (!cloneSvg) throw new Error('Tree connectors SVG not found.');

  document.body.appendChild(clone);
  return { clone, cloneCanvas, cloneSvg };
}

// Measures `.card` (the actual visible card), not its `.card_cont` wrapper.
// `.card_cont` only carries the `transform: translate(x, y)` anchor point
// (see src/renderers/view-cards-html.ts) and has no intrinsic size of its
// own; the real card inside it is then centered on that anchor via its own
// `transform: translate(-50%, -50%)` (src/renderers/card-html.ts), which can
// extend the visible card well outside `.card_cont`'s own (degenerate)
// bounding rect. Measuring `.card_cont` alone underestimates the tree's true
// extent - especially the leftmost/topmost edge - and clips real content.
function computeTreeBounds(cloneCanvas) {
  const cardEls = Array.from(cloneCanvas.querySelectorAll('#htmlSvg .cards_view .card_cont .card'));
  if (cardEls.length === 0) throw new Error('No tree nodes to export.');

  const canvasRect = cloneCanvas.getBoundingClientRect();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of cardEls) {
    const rect = el.getBoundingClientRect();
    const left = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + rect.width);
    maxY = Math.max(maxY, top + rect.height);
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Renders the entire tree (regardless of current viewport/zoom/pan) to a
 * canvas, at high resolution, suitable for printing or sharing.
 *
 * @param {{ container: HTMLElement, margin?: number, scale?: number, onProgress?: (phase: string) => void, signal?: AbortSignal }} options
 * @returns {Promise<HTMLCanvasElement>}
 */
async function renderFullTreeToCanvas({ container, margin = DEFAULT_MARGIN, scale = DEFAULT_RASTER_SCALE, onProgress, signal }) {
  if (!container) throw new Error('A tree container is required.');

  const throwIfCancelled = () => {
    if (signal?.aborted) throw new ExportCancelledError('Export cancelled.');
  };

  onProgress?.('measuring');
  let clone = null;
  try {
    const built = buildOffscreenClone(container);
    clone = built.clone;
    const { cloneCanvas, cloneSvg } = built;
    // Let the browser apply layout/transforms to the clone before measuring.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    throwIfCancelled();

    const bounds = computeTreeBounds(cloneCanvas);
    const cropWidth = bounds.width + margin * 2;
    const cropHeight = bounds.height + margin * 2;

    // Cards left of / above the tree's root sit at negative x/y (from
    // `transform: translate(x, y)` on `.card_cont`, see
    // src/renderers/view-cards-html.ts) - card_cont coordinates are relative
    // to wherever the .view/.cards_view group's own transform puts (0,0).
    // html2canvas can only capture within a rendered box starting at (0,0);
    // it can't reach content that overflows above/left of that origin, no
    // matter what `x`/`y` crop offset is requested. So instead of resetting
    // the view transform to (0,0) and asking html2canvas to crop from a
    // negative x/y (bounds.minX/minY are frequently negative), shift the
    // whole tree by (-bounds.minX + margin, -bounds.minY + margin) so every
    // card - even ones left of the root - lands at a non-negative
    // coordinate, then always crop from (0,0).
    const shiftX = -bounds.minX + margin;
    const shiftY = -bounds.minY + margin;
    cloneCanvas.style.width = `${cropWidth}px`;
    cloneCanvas.style.height = `${cropHeight}px`;

    const cloneLayers = getCanvasLayers(cloneCanvas);
    cloneLayers.view.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(1)`;
    cloneLayers.cardsView.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(1)`;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    throwIfCancelled();

    onProgress?.('rendering');
    throwIfCancelled();

    // Render connectors and cards separately - html2canvas's native <svg>
    // support is unreliable for this markup (see rasterizeSvgLayer) - then
    // composite them onto one canvas, connectors first since they sit
    // visually behind the cards in the live tree.
    const linksCanvas = await rasterizeSvgLayer(cloneSvg, { x: 0, y: 0, width: cropWidth, height: cropHeight, scale });
    throwIfCancelled();

    cloneSvg.style.visibility = 'hidden';
    const cardsCanvas = await html2canvas(cloneCanvas, {
      x: 0,
      y: 0,
      width: cropWidth,
      height: cropHeight,
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
    makeWhiteTransparent(cardsCanvas);

    throwIfCancelled();

    const rasterCanvas = document.createElement('canvas');
    rasterCanvas.width = cardsCanvas.width;
    rasterCanvas.height = cardsCanvas.height;
    const ctx = rasterCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rasterCanvas.width, rasterCanvas.height);
    ctx.drawImage(linksCanvas, 0, 0);
    ctx.drawImage(cardsCanvas, 0, 0);

    return rasterCanvas;
  } finally {
    clone?.remove();
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to generate image data.'))), type, quality);
  });
}

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exports the entire family tree (not just the visible viewport) as a PNG.
 * @param {{ container: HTMLElement, filename?: string, margin?: number, scale?: number, onProgress?: (phase: string) => void, signal?: AbortSignal }} options
 */
async function exportAsPNG({ container, filename = 'family-tree.png', margin, scale, onProgress, signal }) {
  const canvas = await renderFullTreeToCanvas({ container, margin, scale, onProgress, signal });
  onProgress?.('encoding');
  const blob = await canvasToBlob(canvas, 'image/png');
  downloadBlobFile(blob, filename);
}

/**
 * Exports the entire family tree (not just the visible viewport) as a
 * single-page PDF, sized to the tree's aspect ratio, suitable for printing.
 * @param {{ container: HTMLElement, filename?: string, margin?: number, scale?: number, onProgress?: (phase: string) => void, signal?: AbortSignal }} options
 */
async function exportAsPDF({ container, filename = 'family-tree.pdf', margin, scale, onProgress, signal }) {
  const canvas = await renderFullTreeToCanvas({ container, margin, scale, onProgress, signal });
  onProgress?.('encoding');

  const imgData = canvas.toDataURL('image/png');
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [canvas.width, canvas.height],
    compress: true,
  });
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(filename);
}

export const ExportService = {
  exportAsPNG,
  exportAsPDF,
  ExportCancelledError,
};
