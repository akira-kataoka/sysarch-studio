// SVG system-architecture editor: nodes, edges, pan/zoom, linking, selection, history.
import { ICONS } from './icons.js';
import { typeInfo } from './nodes.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const GRID = 24;      // dot spacing
const SNAP = 8;       // node snap step
const NODE_W = 188, NODE_H = 64;

export class Editor {
  constructor(svg) {
    this.svg = svg;
    this.state = { nodes: {}, edges: {}, order: [], counter: 0 };
    this.view = { tx: 0, ty: 0, k: 1 };
    this.sel = { kind: null, id: null };
    this.listeners = {};
    this.showGrid = true;
    this._hist = []; this._future = [];
    this._build();
    this._bind();
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return this; }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }

  // ---------- scaffold ----------
  _build() {
    this.svg.innerHTML = `
      <defs>
        <pattern id="grid-dots" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="1.4"/>
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0.5,1 L9,5 L0.5,9 Z" fill="context-stroke"/>
        </marker>
        <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000" flood-opacity="0.30"/>
        </filter>
      </defs>
      <g id="viewport">
        <rect id="grid-bg" x="-20000" y="-20000" width="40000" height="40000" fill="url(#grid-dots)"/>
        <g id="edges"></g>
        <g id="nodes"></g>
        <g id="overlay"></g>
      </g>`;
    this.$vp = this.svg.querySelector('#viewport');
    this.$grid = this.svg.querySelector('#grid-bg');
    this.$edges = this.svg.querySelector('#edges');
    this.$nodes = this.svg.querySelector('#nodes');
    this.$overlay = this.svg.querySelector('#overlay');
    this._applyView();
  }

  _applyView() {
    const { tx, ty, k } = this.view;
    this.$vp.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    this.$grid.style.display = this.showGrid ? '' : 'none';
    this.emit('view', this.view);
  }

  _resolveTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    this._c = {
      nodeBg: g('--node-bg') || '#1a1f2e',
      edge: g('--edge') || '#7f8aa8',
      accent: g('--accent') || '#7c5cff',
      canvas: g('--canvas-bg') || '#0c0f17',
      nodeText: g('--node-text') || '#eef1f8',
      nodeSub: g('--node-sub') || '#98a2ba',
      textDim: g('--text-dim') || '#9aa3b8',
    };
  }

  screenToWorld(cx, cy) {
    const r = this.svg.getBoundingClientRect();
    return { x: (cx - r.left - this.view.tx) / this.view.k, y: (cy - r.top - this.view.ty) / this.view.k };
  }

  // ---------- data ops ----------
  _id(p) { return `${p}${++this.state.counter}`; }

  addNode(type, x, y, opts = {}) {
    const info = typeInfo(type);
    const isGroup = info.shape === 'group';
    const id = this._id('n');
    const w = isGroup ? 300 : NODE_W;
    const h = isGroup ? 180 : NODE_H;
    const node = {
      id, type, x: snap(x - w / 2), y: snap(y - h / 2), w, h,
      label: opts.label ?? info.label, sub: opts.sub ?? '', color: opts.color ?? info.color,
      shape: info.shape || 'card',
    };
    this.state.nodes[id] = node;
    if (isGroup) this.state.order.unshift(id); else this.state.order.push(id);
    this._pushHistory();
    this.render();
    this.select('node', id);
    return node;
  }

  addEdge(from, to, opts = {}) {
    if (from === to) return null;
    // avoid exact duplicates
    for (const e of Object.values(this.state.edges))
      if (e.from === from && e.to === to) return e;
    const id = this._id('e');
    const edge = { id, from, to, label: opts.label ?? '', style: opts.style ?? 'solid', dir: opts.dir ?? 'forward', color: opts.color ?? '' };
    this.state.edges[id] = edge;
    this._pushHistory();
    this.render();
    return edge;
  }

  updateSelected(patch) {
    const { kind, id } = this.sel;
    if (!kind) return;
    const bag = kind === 'node' ? this.state.nodes : this.state.edges;
    if (!bag[id]) return;
    Object.assign(bag[id], patch);
    this._pushHistory();
    this.render();
    this.emit('select', this.sel);
  }

  // patch selected without rebuilding the inspector (keeps input focus while typing)
  applyPatch(patch, history = true) {
    const { kind, id } = this.sel;
    if (!kind) return;
    const bag = kind === 'node' ? this.state.nodes : this.state.edges;
    if (!bag[id]) return;
    Object.assign(bag[id], patch);
    this.render();
    if (history) this._pushHistory();
  }
  commit() { this._pushHistory(); }
  selected() { const { kind, id } = this.sel; if (!kind) return null; return (kind === 'node' ? this.state.nodes : this.state.edges)[id]; }

  deleteSelected() {
    const { kind, id } = this.sel;
    if (!kind) return;
    if (kind === 'node') {
      delete this.state.nodes[id];
      this.state.order = this.state.order.filter((x) => x !== id);
      for (const [eid, e] of Object.entries(this.state.edges))
        if (e.from === id || e.to === id) delete this.state.edges[eid];
    } else {
      delete this.state.edges[id];
    }
    this.select(null, null);
    this._pushHistory();
    this.render();
  }

  duplicateSelected() {
    if (this.sel.kind !== 'node') return;
    const n = this.state.nodes[this.sel.id];
    if (!n) return;
    const copy = this.addNode(n.type, n.x + n.w / 2 + 28, n.y + n.h / 2 + 28, { label: n.label, sub: n.sub, color: n.color });
    return copy;
  }

  clear() {
    this.state = { nodes: {}, edges: {}, order: [], counter: 0 };
    this.select(null, null);
    this._pushHistory();
    this.render();
  }

  // ---------- selection ----------
  select(kind, id) {
    this.sel = { kind, id };
    this._refreshSelectionClasses();
    this.emit('select', this.sel);
  }

  _refreshSelectionClasses() {
    this.$nodes.querySelectorAll('.node-g').forEach((g) =>
      g.classList.toggle('is-selected', this.sel.kind === 'node' && g.dataset.id === this.sel.id));
    this.$edges.querySelectorAll('.edge-g').forEach((g) =>
      g.classList.toggle('is-selected', this.sel.kind === 'edge' && g.dataset.id === this.sel.id));
    // visual: selected edge stroke
    this.$edges.querySelectorAll('.edge-g').forEach((g) => {
      const on = g.classList.contains('is-selected');
      const vis = g.querySelector('.edge-line');
      const accent = (this._c && this._c.accent) || '#7c5cff';
      if (vis) { vis.setAttribute('stroke-width', on ? 3 : 2); vis.style.filter = on ? `drop-shadow(0 0 6px ${accent})` : ''; vis.setAttribute('stroke', on ? accent : (g.dataset.color || (this._c && this._c.edge) || '#7f8aa8')); }
    });
    // selection outline for node
    this.$nodes.querySelectorAll('.sel-ring').forEach((r) => r.remove());
    if (this.sel.kind === 'node') {
      const g = this.$nodes.querySelector(`.node-g[data-id="${this.sel.id}"]`);
      const n = this.state.nodes[this.sel.id];
      if (g && n) {
        const ring = el('rect', { class: 'sel-ring', x: -4, y: -4, width: n.w + 8, height: n.h + 8, rx: 18, fill: 'none', stroke: (this._c && this._c.accent) || '#7c5cff', 'stroke-width': 2, 'stroke-dasharray': '6 5', opacity: 0.9 });
        g.insertBefore(ring, g.firstChild);
      }
    }
  }

  // ---------- render ----------
  render() {
    this._resolveTheme();
    // edges first
    this.$edges.innerHTML = '';
    for (const e of Object.values(this.state.edges)) {
      const a = this.state.nodes[e.from], b = this.state.nodes[e.to];
      if (!a || !b) continue;
      this.$edges.appendChild(this._edgeEl(e, a, b));
    }
    // nodes in z-order
    this.$nodes.innerHTML = '';
    for (const id of this.state.order) {
      const n = this.state.nodes[id];
      if (n) this.$nodes.appendChild(this._nodeEl(n));
    }
    this._refreshSelectionClasses();
    this.emit('change');
    this._autosave();
  }

  _nodeEl(n) {
    const info = typeInfo(n.type);
    const C = this._c;
    const g = el('g', { class: 'node-g', 'data-id': n.id, transform: `translate(${n.x} ${n.y})` });

    if (n.shape === 'group') {
      g.appendChild(el('rect', { class: 'group-card', width: n.w, height: n.h, rx: 16, fill: mix(n.color, 8), stroke: n.color, 'stroke-width': 1.6, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round', 'stroke-opacity': 0.9 }));
      g.appendChild(text(14, 22, n.label, 'node-title', n.color));
      if (n.sub) g.appendChild(text(14, 40, n.sub, 'node-sub', C.nodeSub));
    } else {
      g.appendChild(el('rect', { class: 'node-card', width: n.w, height: n.h, rx: 14, fill: C.nodeBg, stroke: n.color, 'stroke-width': 1.4, 'stroke-opacity': 0.45, filter: 'url(#node-shadow)' }));
      // accent left bar
      g.appendChild(el('rect', { x: 0, y: 0, width: 4, height: n.h, rx: 2, fill: n.color }));
      // icon badge
      const by = (n.h - 36) / 2;
      g.appendChild(el('rect', { x: 14, y: by, width: 36, height: 36, rx: 10, fill: mix(n.color, 18), stroke: n.color, 'stroke-opacity': 0.4 }));
      const ic = el('g', { transform: `translate(${14 + 8} ${by + 8}) scale(${20 / 24})`, fill: 'none', stroke: n.color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      ic.innerHTML = ICONS[info.icon] || ICONS.box;
      g.appendChild(ic);
      // texts
      const tx = 62;
      if (n.sub) {
        g.appendChild(text(tx, n.h / 2 - 3, n.label, 'node-title', C.nodeText));
        g.appendChild(text(tx, n.h / 2 + 15, n.sub, 'node-sub', C.nodeSub));
      } else {
        g.appendChild(text(tx, n.h / 2 + 5, n.label, 'node-title', C.nodeText));
      }
    }

    // ports
    const ports = el('g', { class: 'ports' });
    for (const [px, py] of [[n.w / 2, 0], [n.w, n.h / 2], [n.w / 2, n.h], [0, n.h / 2]]) {
      ports.appendChild(el('circle', { class: 'port', cx: px, cy: py, r: 5, 'data-id': n.id, 'data-px': px, 'data-py': py }));
    }
    g.appendChild(ports);
    return g;
  }

  _edgeEl(e, a, b) {
    const ca = center(a), cb = center(b);
    const pa = anchor(a, cb.x, cb.y), pb = anchor(b, ca.x, ca.y);
    const d = curve(pa, pb);
    const color = e.color || this._c.edge;
    const g = el('g', { class: 'edge-g', 'data-id': e.id, 'data-color': color });
    g.appendChild(el('path', { class: 'edge-hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': 16, 'pointer-events': 'stroke' }));
    const line = el('path', {
      class: 'edge-line', d, fill: 'none', stroke: color, 'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-dasharray': e.style === 'dashed' ? '7 6' : (e.style === 'dotted' ? '1 7' : ''),
      'marker-end': (e.dir === 'forward' || e.dir === 'both') ? 'url(#arrow)' : '',
      'marker-start': e.dir === 'both' ? 'url(#arrow)' : '',
    });
    g.appendChild(line);
    if (e.label) {
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      const t = text(mx, my - 6, e.label, 'edge-label', this._c.textDim);
      t.setAttribute('text-anchor', 'middle');
      // background pill for readability
      const bg = el('rect', { x: mx - e.label.length * 3.6 - 6, y: my - 18, width: e.label.length * 7.2 + 12, height: 18, rx: 6, fill: this._c.canvas, opacity: 0.85 });
      g.appendChild(bg); g.appendChild(t);
    }
    return g;
  }

  _updateNodeEdges(nodeId) {
    for (const e of Object.values(this.state.edges)) {
      if (e.from !== nodeId && e.to !== nodeId) continue;
      const a = this.state.nodes[e.from], b = this.state.nodes[e.to];
      if (!a || !b) continue;
      const g = this.$edges.querySelector(`.edge-g[data-id="${e.id}"]`);
      if (!g) continue;
      const ca = center(a), cb = center(b);
      const d = curve(anchor(a, cb.x, cb.y), anchor(b, ca.x, ca.y));
      g.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
      // labels don't reflow live; refreshed on full render
    }
  }

  // ---------- interactions ----------
  _bind() {
    let drag = null; // {mode, ...}
    const svg = this.svg;
    const capture = (id) => { try { svg.setPointerCapture(id); } catch {} };

    svg.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || (e.button === 0 && this._space)) { // pan
        drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: this.view.tx, ty: this.view.ty };
        svg.classList.add('panning'); capture(e.pointerId); return;
      }
      if (e.button !== 0) return;
      const portEl = e.target.closest('.port');
      const nodeEl = e.target.closest('.node-g');
      const edgeEl = e.target.closest('.edge-g');

      if (portEl) {
        const id = portEl.dataset.id;
        const start = { x: this.state.nodes[id].x + (+portEl.dataset.px), y: this.state.nodes[id].y + (+portEl.dataset.py) };
        drag = { mode: 'link', from: id, start };
        this._tempLink = el('path', { d: '', fill: 'none', stroke: (this._c && this._c.accent) || '#7c5cff', 'stroke-width': 2.4, 'stroke-dasharray': '5 5', 'marker-end': 'url(#arrow)' });
        this.$overlay.appendChild(this._tempLink);
        svg.classList.add('linking'); capture(e.pointerId);
        return;
      }
      if (nodeEl) {
        const id = nodeEl.dataset.id;
        this.select('node', id);
        const n = this.state.nodes[id];
        const w = this.screenToWorld(e.clientX, e.clientY);
        drag = { mode: 'node', id, ox: w.x - n.x, oy: w.y - n.y, moved: false };
        capture(e.pointerId);
        return;
      }
      if (edgeEl) { this.select('edge', edgeEl.dataset.id); return; }
      // empty → pan + deselect
      this.select(null, null);
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: this.view.tx, ty: this.view.ty };
      svg.classList.add('panning'); capture(e.pointerId);
    });

    svg.addEventListener('pointermove', (e) => {
      if (!drag) { return; }
      if (drag.mode === 'pan') {
        this.view.tx = drag.tx + (e.clientX - drag.sx);
        this.view.ty = drag.ty + (e.clientY - drag.sy);
        this._applyView();
      } else if (drag.mode === 'node') {
        const w = this.screenToWorld(e.clientX, e.clientY);
        const n = this.state.nodes[drag.id];
        n.x = snap(w.x - drag.ox); n.y = snap(w.y - drag.oy);
        drag.moved = true;
        const g = this.$nodes.querySelector(`.node-g[data-id="${drag.id}"]`);
        if (g) g.setAttribute('transform', `translate(${n.x} ${n.y})`);
        this._updateNodeEdges(drag.id);
      } else if (drag.mode === 'link') {
        const w = this.screenToWorld(e.clientX, e.clientY);
        this._tempLink.setAttribute('d', curve({ x: drag.start.x, y: drag.start.y, dir: { x: 0, y: 0 } }, { x: w.x, y: w.y, dir: { x: 0, y: 0 } }));
      }
    });

    const end = (e) => {
      if (!drag) return;
      if (drag.mode === 'node' && drag.moved) { this.render(); this._pushHistory(); }
      if (drag.mode === 'link') {
        this._tempLink?.remove(); this._tempLink = null;
        const tgt = document.elementFromPoint(e.clientX, e.clientY);
        const tn = tgt && tgt.closest && tgt.closest('.node-g');
        if (tn && tn.dataset.id !== drag.from) {
          const edge = this.addEdge(drag.from, tn.dataset.id);
          if (edge) this.select('edge', edge.id);
        }
      }
      svg.classList.remove('panning', 'linking');
      drag = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    // double click a node → edit label event
    svg.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest('.node-g');
      if (nodeEl) { this.select('node', nodeEl.dataset.id); this.emit('editlabel', nodeEl.dataset.id); }
    });

    // wheel zoom to cursor
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0016);
      this.zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });

    // space to pan
    this._space = false;
    addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) { this._space = true; svg.classList.add('pannable'); } });
    addEventListener('keyup', (e) => { if (e.code === 'Space') { this._space = false; svg.classList.remove('pannable'); } });
  }

  zoomAt(clientX, clientY, factor) {
    const r = this.svg.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    const k2 = clamp(this.view.k * factor, 0.15, 3.5);
    const f = k2 / this.view.k;
    this.view.tx = sx - (sx - this.view.tx) * f;
    this.view.ty = sy - (sy - this.view.ty) * f;
    this.view.k = k2;
    this._applyView();
  }

  zoomBy(factor) {
    const r = this.svg.getBoundingClientRect();
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }

  contentBBox(pad = 60) {
    const ns = Object.values(this.state.nodes);
    if (!ns.length) return { x: 0, y: 0, w: 800, h: 600 };
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const n of ns) {
      minx = Math.min(minx, n.x); miny = Math.min(miny, n.y);
      maxx = Math.max(maxx, n.x + n.w); maxy = Math.max(maxy, n.y + n.h);
    }
    return { x: minx - pad, y: miny - pad, w: (maxx - minx) + pad * 2, h: (maxy - miny) + pad * 2 };
  }

  fitView() {
    const b = this.contentBBox(70);
    const r = this.svg.getBoundingClientRect();
    const k = clamp(Math.min(r.width / b.w, r.height / b.h), 0.15, 1.6);
    this.view.k = k;
    this.view.tx = (r.width - b.w * k) / 2 - b.x * k;
    this.view.ty = (r.height - b.h * k) / 2 - b.y * k;
    this._applyView();
  }

  toggleGrid(v) { this.showGrid = v ?? !this.showGrid; this._applyView(); return this.showGrid; }

  // ---------- history ----------
  _pushHistory() {
    this._hist.push(JSON.stringify(this.state));
    if (this._hist.length > 80) this._hist.shift();
    this._future = [];
  }
  undo() {
    if (this._hist.length < 2) return;
    this._future.push(this._hist.pop());
    this.state = JSON.parse(this._hist[this._hist.length - 1]);
    this.select(null, null); this.render();
  }
  redo() {
    if (!this._future.length) return;
    const s = this._future.pop();
    this._hist.push(s);
    this.state = JSON.parse(s);
    this.select(null, null); this.render();
  }

  // ---------- persistence ----------
  toJSON() { return { version: 1, state: this.state, view: this.view }; }
  loadJSON(obj) {
    if (!obj || !obj.state) throw new Error('invalid file');
    this.state = obj.state;
    // recompute counter
    let max = 0;
    for (const id of [...Object.keys(this.state.nodes), ...Object.keys(this.state.edges)]) {
      const m = /(\d+)$/.exec(id); if (m) max = Math.max(max, +m[1]);
    }
    this.state.counter = Math.max(this.state.counter || 0, max);
    this.select(null, null);
    this._hist = []; this._future = [];
    this._pushHistory();
    this.render();
    this.fitView();
  }
  _autosave() {
    try { localStorage.setItem('sysarch:auto', JSON.stringify(this.toJSON())); } catch {}
  }
  loadAutosave() {
    try {
      const raw = localStorage.getItem('sysarch:auto');
      if (!raw) return false;
      const obj = JSON.parse(raw);
      if (!obj.state || !Object.keys(obj.state.nodes || {}).length) return false;
      this.state = obj.state; this.state.counter ||= 0;
      this._pushHistory(); this.render();
      if (obj.view) { this.view = obj.view; this._applyView(); }
      return true;
    } catch { return false; }
  }
}

// ---------- geometry / dom helpers ----------
function center(n) { return { x: n.x + n.w / 2, y: n.y + n.h / 2 }; }
function snap(v) { return Math.round(v / SNAP) * SNAP; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function anchor(node, tx, ty) {
  const cx = node.x + node.w / 2, cy = node.y + node.h / 2;
  const dx = tx - cx, dy = ty - cy;
  const hw = node.w / 2, hh = node.h / 2;
  if (dx === 0 && dy === 0) return { x: cx + hw, y: cy, dir: { x: 1, y: 0 } };
  const sx = Math.abs(dx) / hw, sy = Math.abs(dy) / hh;
  if (sx >= sy) {
    const s = hw / Math.abs(dx);
    return { x: cx + Math.sign(dx) * hw, y: cy + dy * s, dir: { x: Math.sign(dx), y: 0 } };
  }
  const s = hh / Math.abs(dy);
  return { x: cx + dx * s, y: cy + Math.sign(dy) * hh, dir: { x: 0, y: Math.sign(dy) } };
}

function curve(a, b) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const off = Math.max(34, dist * 0.36);
  const c1x = a.x + a.dir.x * off, c1y = a.y + a.dir.y * off;
  const c2x = b.x + b.dir.x * off, c2y = b.y + b.dir.y * off;
  return `M ${a.x} ${a.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${b.x} ${b.y}`;
}

function el(name, attrs = {}) {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function text(x, y, str, cls, fill) {
  const t = el('text', { x, y, class: cls, fill: fill || '#e7eaf3' });
  t.textContent = str;
  return t;
}
// tint a hex color to an rgba() with the given alpha percentage (export-safe, no color-mix)
function mix(color, pct) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${(pct / 100).toFixed(3)})`;
}
function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length < 6) return { r: 148, g: 163, b: 184 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
