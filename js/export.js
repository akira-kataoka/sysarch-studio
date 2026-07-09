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

// rasterize to a JPEG (bytes + pixel dims) for PDF embedding
function rasterizeJPEG(editor, scale, quality, opts = {}) {
  const { text, width, height } = buildSVG(editor, { ...opts, background: true });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // JPEG has no alpha
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('toBlob failed'));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        resolve({ bytes, pxW: canvas.width, pxH: canvas.height, ptW: width, ptH: height });
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('rasterize failed')); };
    img.src = url;
  });
}

// assemble a minimal single-page PDF (points = SVG units) embedding the JPEG (DCTDecode)
function buildPDF(jpeg) {
  const enc = new TextEncoder();
  const parts = []; let len = 0;
  const push = (d) => { const u = typeof d === 'string' ? enc.encode(d) : d; parts.push(u); len += u.length; };
  const off = [0]; // object offsets, 1-indexed
  const obj = (s) => { off.push(len); push(s); };
  const W = jpeg.ptW.toFixed(2), H = jpeg.ptH.toFixed(2);

  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4 + binary
  obj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  obj(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  obj(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${jpeg.pxW} /Height ${jpeg.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.bytes.length} >>\nstream\n`);
  push(jpeg.bytes); push('\nendstream\nendobj\n');
  const content = `q\n${W} 0 0 ${H} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefPos = len;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) xref += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  const out = new Uint8Array(len); let p = 0;
  for (const u of parts) { out.set(u, p); p += u.length; }
  return out;
}

export async function exportPDF(editor, scale = 2, opts = {}) {
  const jpeg = await rasterizeJPEG(editor, scale, 0.92, opts);
  const pdf = buildPDF(jpeg);
  triggerDownload(new Blob([pdf], { type: 'application/pdf' }), `sysarch-${stamp()}.pdf`);
}
