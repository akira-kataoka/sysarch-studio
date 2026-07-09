// Export the diagram as a clean standalone SVG, or rasterize to PNG.
const XMLNS = 'http://www.w3.org/2000/svg';

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
  return {
    canvas: g('--canvas-bg', '#0c0f17'),
    edge: g('--edge', '#7f8aa8'),
  };
}

const FONT_CSS =
  `text{font-family:'Inter',system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;}` +
  `.node-title{font-weight:600;font-size:13.5px;}` +
  `.node-sub{font-weight:400;font-size:10.5px;}` +
  `.edge-label{font-weight:500;font-size:11px;}`;

// Build a self-contained SVG string of the current diagram.
export function buildSVG(editor, opts = {}) {
  const pad = opts.pad ?? 48;
  const b = editor.contentBBox(pad);
  const C = themeColors();
  const ser = new XMLSerializer();

  // defs (drop the grid pattern — not part of the artwork)
  const defs = editor.svg.querySelector('defs').cloneNode(true);
  defs.querySelector('#grid-dots')?.remove();

  // edges: drop hit areas, strip selection styling
  const edges = editor.$edges.cloneNode(true);
  edges.querySelectorAll('.edge-hit').forEach((e) => e.remove());
  edges.querySelectorAll('.edge-g').forEach((g) => {
    const line = g.querySelector('.edge-line');
    if (line) { line.setAttribute('stroke', g.dataset.color || C.edge); line.setAttribute('stroke-width', 2); line.removeAttribute('style'); }
  });

  // nodes: drop ports and selection rings
  const nodes = editor.$nodes.cloneNode(true);
  nodes.querySelectorAll('.ports, .sel-ring').forEach((e) => e.remove());

  const bg = opts.background === false ? ''
    : `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${C.canvas}"/>`;

  const wm = opts.watermark
    ? `<text x="${b.x + b.w - 12}" y="${b.y + b.h - 10}" text-anchor="end" font-size="10" fill="${C.edge}" opacity="0.5">made with SysArch Studio</text>`
    : '';

  return {
    width: Math.round(b.w),
    height: Math.round(b.h),
    text:
      `<svg xmlns="${XMLNS}" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${b.w}" height="${b.h}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">` +
      ser.serializeToString(defs) +
      `<style>${FONT_CSS}</style>` +
      bg +
      ser.serializeToString(edges) +
      ser.serializeToString(nodes) +
      wm +
      `</svg>`,
  };
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportSVG(editor, opts = {}) {
  const { text } = buildSVG(editor, opts);
  triggerDownload(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), `sysarch-${stamp()}.svg`);
}

function rasterize(editor, scale, opts = {}) {
  const { text, width, height } = buildSVG(editor, opts);
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('rasterize failed')); };
    img.src = url;
  });
}

export async function exportPNG(editor, scale = 2, opts = {}) {
  const blob = await rasterize(editor, scale, opts);
  triggerDownload(blob, `sysarch-${stamp()}@${scale}x.png`);
}

export async function copyPNG(editor, scale = 2, opts = {}) {
  const blob = await rasterize(editor, scale, opts);
  if (!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard unsupported');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
