// SVG system-architecture editor: nodes, edges, pan/zoom, linking, selection, history.
import { ICONS } from './icons.js?v=29';
import { typeInfo } from './nodes.js?v=29';
import { BRAND_ICONS } from './brands.js?v=29';

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
    this.selNodes = new Set();   // multi-selected node ids
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
    const shape = info.shape || 'card';
    const id = this._id('n');
    const [w, h] = ({ group: [320, 200], band: [460, 300], banner: [320, 52], plain: [150, 46], text: [150, 30], list: [200, 120], table: [232, 150], uml: [210, 150], legend: [232, 128] }[shape]) || [NODE_W, NODE_H];
    const backLayer = shape === 'group' || shape === 'band';
    const node = {
      id, type, x: snap(x - w / 2), y: snap(y - h / 2), w, h,
      label: opts.label ?? info.label, sub: opts.sub ?? '', color: opts.color ?? info.color,
      shape,
    };
    if (opts.img) node.img = opts.img;
    // structured shapes drop in with sample content so their layout is obvious
    if (node.sub === '') {
      const defs = { list: '項目1\n項目2\n項目3', table: '# id | bigint\nname | varchar(255)\nstatus | int\ncreated_at | datetime', uml: '- id: number\n- name: string\n--\n+ create(): void\n+ update(): void', legend: 'solid|同期 / API 呼び出し\ndashed|非同期 / イベント\ndotted|バッチ / 日次連携\narrow|データの流れ方向' };
      if (defs[shape]) node.sub = defs[shape];
    }
    this.state.nodes[id] = node;
    if (backLayer) this.state.order.unshift(id); else this.state.order.push(id);
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
    const edge = { id, from, to, label: opts.label ?? '', style: opts.style ?? 'solid', dir: opts.dir ?? 'forward', route: opts.route ?? 'curved', color: opts.color ?? '', points: opts.points ?? [] };
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
    if (this.selNodes.size) {
      const ids = this.selNodes;
      this.state.order = this.state.order.filter((x) => !ids.has(x));
      for (const id of ids) delete this.state.nodes[id];
      for (const [eid, e] of Object.entries(this.state.edges))
        if (ids.has(e.from) || ids.has(e.to)) delete this.state.edges[eid];
      this.select(null, null);
      this._pushHistory(); this.render();
      return;
    }
    if (this.sel.kind === 'edge') {
      delete this.state.edges[this.sel.id];
      this.select(null, null);
      this._pushHistory(); this.render();
    }
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
    this.selNodes = (kind === 'node' && id) ? new Set([id]) : new Set();
    this.sel = { kind, id };
    this._refreshSelectionClasses();
    this.emit('select', this.sel);
  }
  selectNodes(ids) {
    this.selNodes = new Set(ids);
    const arr = [...this.selNodes];
    this.sel = arr.length ? { kind: 'node', id: arr[arr.length - 1] } : { kind: null, id: null };
    this._refreshSelectionClasses();
    this.emit('select', this.sel);
  }
  toggleNode(id) {
    if (this.selNodes.has(id)) this.selNodes.delete(id); else this.selNodes.add(id);
    const arr = [...this.selNodes];
    this.sel = arr.length ? { kind: 'node', id: arr[arr.length - 1] } : { kind: null, id: null };
    this._refreshSelectionClasses();
    this.emit('select', this.sel);
  }

  _refreshSelectionClasses() {
    const accent = (this._c && this._c.accent) || '#7c5cff';
    this.$nodes.querySelectorAll('.node-g').forEach((g) =>
      g.classList.toggle('is-selected', this.selNodes.has(g.dataset.id)));
    this.$edges.querySelectorAll('.edge-g').forEach((g) =>
      g.classList.toggle('is-selected', this.sel.kind === 'edge' && g.dataset.id === this.sel.id));
    // visual: selected edge stroke
    this.$edges.querySelectorAll('.edge-g').forEach((g) => {
      const on = g.classList.contains('is-selected');
      const vis = g.querySelector('.edge-line');
      if (vis) { vis.setAttribute('stroke-width', on ? 3 : 2); vis.style.filter = on ? `drop-shadow(0 0 6px ${accent})` : ''; vis.setAttribute('stroke', on ? accent : (g.dataset.color || (this._c && this._c.edge) || '#7f8aa8')); }
    });
    // selection outlines for all selected nodes (+ resize handle only when exactly one)
    this.$nodes.querySelectorAll('.sel-ring, .resize-handle').forEach((r) => r.remove());
    for (const id of this.selNodes) {
      const g = this.$nodes.querySelector(`.node-g[data-id="${id}"]`);
      const n = this.state.nodes[id];
      if (!g || !n) continue;
      const ring = el('rect', { class: 'sel-ring', x: -4, y: -4, width: n.w + 8, height: n.h + 8, rx: 18, fill: 'none', stroke: accent, 'stroke-width': 2, 'stroke-dasharray': '6 5', opacity: 0.9 });
      g.insertBefore(ring, g.firstChild);
      if (this.selNodes.size === 1 && ['card', 'plain', 'banner', 'group', 'band'].includes(n.shape || 'card')) {
        g.appendChild(el('rect', { class: 'resize-handle', x: n.w - 6, y: n.h - 6, width: 14, height: 14, rx: 3, fill: accent, stroke: '#fff', 'stroke-width': 1.5, 'data-id': n.id }));
      }
    }
    // waypoint + endpoint handles for a selected edge
    this.$overlay.querySelectorAll('.wp-handle, .wp-add, .ep-handle').forEach((h) => h.remove());
    if (this.sel.kind === 'edge') {
      const e = this.state.edges[this.sel.id];
      const a = e && this.state.nodes[e.from], b = e && this.state.nodes[e.to];
      if (e && a && b) {
        const { pa, pb, wp } = this._edgeGeom(e, a, b);
        const chain = [pa, ...wp, pb];
        const r = 6 / this.view.k, ra = 4.5 / this.view.k, ep = 5.5 / this.view.k;
        for (let i = 0; i < chain.length - 1; i++) {   // add-handles at segment midpoints
          const mx = (chain[i].x + chain[i + 1].x) / 2, my = (chain[i].y + chain[i + 1].y) / 2;
          this.$overlay.appendChild(el('circle', { class: 'wp-add', cx: mx, cy: my, r: ra, fill: accent, 'fill-opacity': 0.45, stroke: '#fff', 'stroke-width': 1 / this.view.k, 'data-edge': e.id, 'data-seg': i }));
        }
        wp.forEach((p, i) => this.$overlay.appendChild(el('circle', { class: 'wp-handle', cx: p.x, cy: p.y, r, fill: accent, stroke: '#fff', 'stroke-width': 1.5 / this.view.k, 'data-edge': e.id, 'data-idx': i })));
        // endpoint handles (square) to reconnect the source/target
        this.$overlay.appendChild(el('rect', { class: 'ep-handle', x: pa.x - ep, y: pa.y - ep, width: ep * 2, height: ep * 2, rx: 2 / this.view.k, fill: '#fff', stroke: accent, 'stroke-width': 2 / this.view.k, 'data-edge': e.id, 'data-end': 'from' }));
        this.$overlay.appendChild(el('rect', { class: 'ep-handle', x: pb.x - ep, y: pb.y - ep, width: ep * 2, height: ep * 2, rx: 2 / this.view.k, fill: '#fff', stroke: accent, 'stroke-width': 2 / this.view.k, 'data-edge': e.id, 'data-end': 'to' }));
      }
    }
  }

  // ---------- multi-node arrange ----------
  _selArr() { return [...this.selNodes].map((id) => this.state.nodes[id]).filter(Boolean); }
  alignSelected(mode) {
    const ns = this._selArr(); if (ns.length < 2) return;
    const minL = Math.min(...ns.map((n) => n.x)), maxR = Math.max(...ns.map((n) => n.x + n.w));
    const minT = Math.min(...ns.map((n) => n.y)), maxB = Math.max(...ns.map((n) => n.y + n.h));
    const cx = (minL + maxR) / 2, cy = (minT + maxB) / 2;
    for (const n of ns) {
      if (mode === 'left') n.x = snap(minL);
      else if (mode === 'right') n.x = snap(maxR - n.w);
      else if (mode === 'hcenter') n.x = snap(cx - n.w / 2);
      else if (mode === 'top') n.y = snap(minT);
      else if (mode === 'bottom') n.y = snap(maxB - n.h);
      else if (mode === 'vcenter') n.y = snap(cy - n.h / 2);
    }
    this._pushHistory(); this.render();
  }
  distributeSelected(axis) {
    const ns = this._selArr(); if (ns.length < 3) return;
    if (axis === 'h') { ns.sort((a, b) => a.x - b.x); const step = (ns[ns.length - 1].x - ns[0].x) / (ns.length - 1); ns.forEach((n, i) => { if (i > 0 && i < ns.length - 1) n.x = snap(ns[0].x + step * i); }); }
    else { ns.sort((a, b) => a.y - b.y); const step = (ns[ns.length - 1].y - ns[0].y) / (ns.length - 1); ns.forEach((n, i) => { if (i > 0 && i < ns.length - 1) n.y = snap(ns[0].y + step * i); }); }
    this._pushHistory(); this.render();
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
    this._fitTexts();
    this._refreshSelectionClasses();
    this.emit('change');
    this._autosave();
  }

  // condense any label that would overflow its node (measured in-DOM, keeps full text)
  _fitTexts() {
    this.$nodes.querySelectorAll('text[data-maxw]').forEach((t) => {
      const maxw = +t.dataset.maxw;
      t.removeAttribute('textLength'); t.removeAttribute('lengthAdjust');
      if (!(maxw > 12)) return;
      let len = 0; try { len = t.getComputedTextLength(); } catch {}
      if (len > maxw) { t.setAttribute('textLength', maxw); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
    });
  }

  _nodeEl(n) {
    const info = typeInfo(n.type);
    const C = this._c;
    const shape = n.shape || 'card';
    const g = el('g', { class: 'node-g', 'data-id': n.id, transform: `translate(${n.x} ${n.y})` });

    // ---- background band: large translucent region, header chip only is clickable ----
    if (shape === 'band') {
      g.appendChild(el('rect', { width: n.w, height: n.h, rx: 18, fill: mix(n.color, 8), stroke: mix(n.color, 28), 'stroke-width': 1.4, 'pointer-events': 'none' }));
      const cw = (n.label || ' ').length * 8 + 26;
      g.appendChild(el('rect', { class: 'grp-head', x: 14, y: 12, width: cw, height: 24, rx: 7, fill: mix(n.color, 24) }));
      g.appendChild(text(26, 28, n.label, 'node-sub', n.color));
      return g; // no ports
    }

    // ---- zone / department container: titled header bar, body is click-through ----
    if (shape === 'group') {
      g.appendChild(el('rect', { width: n.w, height: n.h, rx: 14, fill: mix(n.color, 6), stroke: n.color, 'stroke-width': 1.4, 'stroke-opacity': 0.8, 'pointer-events': 'none' }));
      g.appendChild(el('rect', { class: 'grp-head', width: n.w, height: 32, rx: 14, fill: mix(n.color, 20) }));
      g.appendChild(el('rect', { class: 'grp-head', y: 16, width: n.w, height: 16, fill: mix(n.color, 20) }));
      g.appendChild(text(14, 21, n.label, 'node-title', n.color)).setAttribute('data-maxw', n.w - (n.sub ? 110 : 26));
      if (n.sub) g.appendChild(text(n.w - 12, 21, n.sub, 'node-sub', C.nodeSub)).setAttribute('text-anchor', 'end');
      return g; // no ports; drag by header
    }

    // ---- title banner: solid accent bar with white text ----
    if (shape === 'banner') {
      g.appendChild(el('rect', { class: 'node-card', width: n.w, height: n.h, rx: 10, fill: n.color, filter: 'url(#node-shadow)' }));
      g.appendChild(text(16, n.h / 2 + 5, n.label, 'node-title', '#ffffff')).setAttribute('data-maxw', n.w - 32);
      return this._withPorts(g, n);
    }

    // ---- plain process box: centered label, no icon badge ----
    if (shape === 'plain') {
      g.appendChild(el('rect', { class: 'node-card', width: n.w, height: n.h, rx: 9, fill: C.nodeBg, stroke: n.color, 'stroke-width': 1.4, 'stroke-opacity': 0.7, filter: 'url(#node-shadow)' }));
      const c1 = text(n.w / 2, n.sub ? n.h / 2 - 3 : n.h / 2 + 5, n.label, 'node-title', C.nodeText); c1.setAttribute('text-anchor', 'middle'); c1.setAttribute('data-maxw', n.w - 16); g.appendChild(c1);
      if (n.sub) { const c2 = text(n.w / 2, n.h / 2 + 15, n.sub, 'node-sub', C.nodeSub); c2.setAttribute('text-anchor', 'middle'); c2.setAttribute('data-maxw', n.w - 16); g.appendChild(c2); }
      return this._withPorts(g, n);
    }

    // ---- free text / annotation: no box, auto-sized, selectable via invisible hit area ----
    if (shape === 'text') {
      const auto = (n.color === info.color);
      const fill = auto ? C.nodeText : n.color;
      const lines = String(n.label || 'テキスト').split('\n');
      const fs = 14, lh = 19;
      const longest = Math.max(1, ...lines.map((l) => l.length));
      n.w = Math.max(40, Math.round(longest * fs * 0.72) + 8);
      n.h = Math.max(22, lines.length * lh + 6);
      g.appendChild(el('rect', { width: n.w, height: n.h, fill: 'transparent' }));
      lines.forEach((ln, i) => { const t = text(2, 16 + i * lh, ln, 'node-title', fill); t.setAttribute('font-size', fs); g.appendChild(t); });
      return g;
    }

    // ---- bullet list: header + body lines (from sub, newline-separated), auto height ----
    if (shape === 'list') {
      const lines = String(n.sub || '').split('\n').filter((x) => x.trim() !== '');
      const headerH = 30, lineH = 20, padB = 10;
      n.h = headerH + Math.max(1, lines.length) * lineH + padB;
      g.appendChild(el('rect', { class: 'node-card', width: n.w, height: n.h, rx: 10, fill: C.nodeBg, stroke: n.color, 'stroke-width': 1.4, 'stroke-opacity': 0.6, filter: 'url(#node-shadow)' }));
      g.appendChild(el('rect', { class: 'grp-head', width: n.w, height: headerH, rx: 10, fill: mix(n.color, 16) }));
      g.appendChild(el('rect', { class: 'grp-head', y: headerH - 10, width: n.w, height: 10, fill: mix(n.color, 16) }));
      g.appendChild(text(12, 20, n.label, 'node-title', C.nodeText));
      lines.forEach((ln, i) => {
        const cy = headerH + 6 + i * lineH;
        g.appendChild(el('circle', { cx: 16, cy: cy + 4, r: 2.6, fill: n.color }));
        g.appendChild(text(26, cy + 8, ln, 'node-sub', C.nodeSub));
      });
      return this._withPorts(g, n);
    }

    // ---- table / ER entity: header + "名前 | 型" rows with separators & key markers ----
    if (shape === 'table') {
      const rows = String(n.sub || '').split('\n').filter((x) => x.trim() !== '');
      const headerH = 32, rowH = 25, padB = 6;
      n.h = headerH + Math.max(1, rows.length) * rowH + padB;
      const hasCols = rows.some((r) => r.includes('|'));
      const colX = Math.round(n.w * 0.56);
      g.appendChild(el('rect', { class: 'node-card', width: n.w, height: n.h, rx: 10, fill: C.nodeBg, stroke: n.color, 'stroke-width': 1.4, 'stroke-opacity': 0.6, filter: 'url(#node-shadow)' }));
      g.appendChild(el('rect', { class: 'grp-head', width: n.w, height: headerH, rx: 10, fill: mix(n.color, 20) }));
      g.appendChild(el('rect', { class: 'grp-head', y: headerH - 10, width: n.w, height: 10, fill: mix(n.color, 20) }));
      g.appendChild(text(12, 21, n.label, 'node-title', C.nodeText)).setAttribute('data-maxw', n.w - 24);
      if (hasCols) g.appendChild(el('line', { x1: colX, y1: headerH, x2: colX, y2: n.h, stroke: mix(n.color, 22), 'stroke-width': 1 }));
      rows.forEach((raw, i) => {
        const top = headerH + i * rowH;
        if (i > 0) g.appendChild(el('line', { x1: 0, y1: top, x2: n.w, y2: top, stroke: mix(n.color, 18), 'stroke-width': 1 }));
        const ty = top + rowH / 2 + 4;
        const cells = raw.split('|').map((s) => s.trim());
        const key = /^[*#]/.test(cells[0]);
        if (key) cells[0] = cells[0].replace(/^[*#]\s*/, '');
        if (key) g.appendChild(el('circle', { cx: 9, cy: top + rowH / 2, r: 3, fill: '#ffd166' }));
        const lx = key ? 18 : 12;
        const nameT = text(lx, ty, cells[0] || '', 'node-sub', C.nodeText);
        if (key) nameT.setAttribute('font-weight', '600');
        nameT.setAttribute('data-maxw', (hasCols ? colX : n.w) - lx - 6);
        g.appendChild(nameT);
        if (cells.length > 1) {
          const t2 = text(colX + 8, ty, cells.slice(1).join(' | '), 'node-sub', C.nodeSub);
          t2.setAttribute('data-maxw', n.w - colX - 14);
          g.appendChild(t2);
        }
      });
      return this._withPorts(g, n);
    }

    // ---- UML class / 機能: name header + compartments split by a "--" line ----
    if (shape === 'uml') {
      const comps = [[]];
      String(n.sub || '').split('\n').forEach((l) => {
        const t = l.trim();
        if (/^-{2,}$/.test(t)) comps.push([]);
        else if (t !== '') comps[comps.length - 1].push(t);
      });
      const usable = comps.filter((c) => c.length);
      const headerH = 32, lineH = 20, padT = 6, padBt = 4;
      const totalLines = usable.reduce((a, c) => a + c.length, 0);
      n.h = headerH + usable.length * (padT + padBt) + totalLines * lineH + 4;
      g.appendChild(el('rect', { class: 'node-card', width: n.w, height: n.h, rx: 8, fill: C.nodeBg, stroke: n.color, 'stroke-width': 1.4, 'stroke-opacity': 0.6, filter: 'url(#node-shadow)' }));
      g.appendChild(el('rect', { class: 'grp-head', width: n.w, height: headerH, rx: 8, fill: mix(n.color, 20) }));
      g.appendChild(el('rect', { class: 'grp-head', y: headerH - 8, width: n.w, height: 8, fill: mix(n.color, 20) }));
      const title = text(n.w / 2, 21, n.label, 'node-title', C.nodeText); title.setAttribute('text-anchor', 'middle'); title.setAttribute('data-maxw', n.w - 20);
      g.appendChild(title);
      let y = headerH;
      usable.forEach((c, ci) => {
        if (ci > 0) g.appendChild(el('line', { x1: 0, y1: y, x2: n.w, y2: y, stroke: mix(n.color, 22), 'stroke-width': 1 }));
        y += padT;
        c.forEach((ln) => { g.appendChild(text(12, y + 13, ln, 'node-sub', C.nodeSub)).setAttribute('data-maxw', n.w - 22); y += lineH; });
        y += padBt;
      });
      return this._withPorts(g, n);
    }

    // ---- legend / 凡例: titled box; each row "style|text" shows a line swatch + meaning ----
    if (shape === 'legend') {
      const rows = String(n.sub || '').split('\n').filter((x) => x.trim() !== '');
      const headerH = 30, rowH = 22, padB = 10, swX = 14, swW = 34, gap = 12;
      n.h = headerH + Math.max(1, rows.length) * rowH + padB;
      g.appendChild(el('rect', { class: 'node-card', width: n.w, height: n.h, rx: 10, fill: C.nodeBg, stroke: n.color, 'stroke-width': 1.4, 'stroke-opacity': 0.6, filter: 'url(#node-shadow)' }));
      g.appendChild(el('rect', { class: 'grp-head', width: n.w, height: headerH, rx: 10, fill: mix(n.color, 16) }));
      g.appendChild(el('rect', { class: 'grp-head', y: headerH - 10, width: n.w, height: 10, fill: mix(n.color, 16) }));
      g.appendChild(text(12, 20, n.label, 'node-title', C.nodeText));
      rows.forEach((raw, i) => {
        const cy = headerH + 4 + i * rowH + rowH / 2;
        const bar = raw.indexOf('|');
        const tok = (bar >= 0 ? raw.slice(0, bar) : 'solid').trim().toLowerCase();
        const cap = (bar >= 0 ? raw.slice(bar + 1) : raw).trim();
        const dash = tok === 'dashed' ? '7 5' : tok === 'dotted' ? '1.5 4' : null;
        const x2 = tok === 'arrow' ? swX + swW - 7 : swX + swW;
        const ln = el('line', { x1: swX, y1: cy, x2, y2: cy, stroke: n.color, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
        if (dash) ln.setAttribute('stroke-dasharray', dash);
        g.appendChild(ln);
        if (tok === 'arrow') g.appendChild(el('path', { d: `M${swX + swW - 8} ${cy - 4.5} L${swX + swW} ${cy} L${swX + swW - 8} ${cy + 4.5} Z`, fill: n.color }));
        g.appendChild(text(swX + swW + gap, cy + 4, cap, 'node-sub', C.nodeSub)).setAttribute('data-maxw', n.w - (swX + swW + gap) - 10);
      });
      return this._withPorts(g, n);
    }

    // ---- compact logo tile: icon-only square + small caption (for dense diagrams) ----
    if (info.logo && n.compact) {
      const bi = BRAND_ICONS[n.type];
      const s = 60, tx = (n.w - s) / 2, ty = 2;
      if (n.img) {
        g.appendChild(el('rect', { x: tx, y: ty, width: s, height: s, rx: 12, fill: '#ffffff', filter: 'url(#node-shadow)' }));
        const im = el('image', { x: tx + 4, y: ty + 4, width: s - 8, height: s - 8, preserveAspectRatio: 'xMidYMid meet' });
        im.setAttribute('href', n.img); im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', n.img);
        g.appendChild(im);
      } else if (bi) {
        g.appendChild(el('rect', { x: tx, y: ty, width: s, height: s, rx: 12, fill: bi.hex, filter: 'url(#node-shadow)' }));
        const ic = el('g', { transform: `translate(${tx + (s - 34) / 2} ${ty + (s - 34) / 2}) scale(${34 / 24})`, fill: '#ffffff' });
        ic.innerHTML = `<path d="${bi.path}"/>`; g.appendChild(ic);
      } else {
        g.appendChild(el('rect', { x: tx, y: ty, width: s, height: s, rx: 12, fill: n.color, filter: 'url(#node-shadow)' }));
        const in2 = text(n.w / 2, ty + s / 2 + 7, initials(n.label), 'node-title', '#ffffff'); in2.setAttribute('text-anchor', 'middle'); in2.setAttribute('font-size', '20'); g.appendChild(in2);
      }
      if (n.label) { const cap = text(n.w / 2, ty + s + 15, n.label, 'node-sub', C.nodeSub); cap.setAttribute('text-anchor', 'middle'); g.appendChild(cap); }
      return this._withPorts(g, n);
    }

    // ---- default card (icon badge + title + subtitle); logo tiles use a filled initial chip ----
    g.appendChild(el('rect', { class: 'node-card', width: n.w, height: n.h, rx: 14, fill: C.nodeBg, stroke: n.color, 'stroke-width': 1.4, 'stroke-opacity': 0.45, filter: 'url(#node-shadow)' }));
    g.appendChild(el('rect', { x: 0, y: 0, width: 4, height: n.h, rx: 2, fill: n.color }));
    const by = (n.h - 36) / 2;
    if (info.logo) {
      const bi = BRAND_ICONS[n.type];
      if (n.img) {
        // user-uploaded image (data URI → self-contained, export-safe, no canvas taint)
        g.appendChild(el('rect', { x: 14, y: by, width: 36, height: 36, rx: 9, fill: '#ffffff' }));
        const im = el('image', { x: 15, y: by + 1, width: 34, height: 34, preserveAspectRatio: 'xMidYMid meet' });
        im.setAttribute('href', n.img);
        im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', n.img);
        g.appendChild(im);
      } else if (bi) {
        // brand icon (Simple Icons, CC0) on a brand-color tile
        g.appendChild(el('rect', { x: 14, y: by, width: 36, height: 36, rx: 9, fill: bi.hex }));
        const ic = el('g', { transform: `translate(${14 + 8} ${by + 8}) scale(${20 / 24})`, fill: '#ffffff' });
        ic.innerHTML = `<path d="${bi.path}"/>`;
        g.appendChild(ic);
      } else {
        // no icon available → initials chip on the node's color
        g.appendChild(el('rect', { x: 14, y: by, width: 36, height: 36, rx: 9, fill: n.color }));
        const in2 = text(32, by + 24, initials(n.label), 'node-title', '#ffffff');
        in2.setAttribute('text-anchor', 'middle'); in2.setAttribute('font-size', '13'); g.appendChild(in2);
      }
    } else {
      g.appendChild(el('rect', { x: 14, y: by, width: 36, height: 36, rx: 10, fill: mix(n.color, 18), stroke: n.color, 'stroke-opacity': 0.4 }));
      const ic = el('g', { transform: `translate(${14 + 8} ${by + 8}) scale(${20 / 24})`, fill: 'none', stroke: n.color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      ic.innerHTML = ICONS[info.icon] || ICONS.box;
      g.appendChild(ic);
    }
    const tx = 62, mw = n.w - tx - 12;
    if (n.sub) {
      g.appendChild(text(tx, n.h / 2 - 3, n.label, 'node-title', C.nodeText)).setAttribute('data-maxw', mw);
      g.appendChild(text(tx, n.h / 2 + 15, n.sub, 'node-sub', C.nodeSub)).setAttribute('data-maxw', mw);
    } else {
      g.appendChild(text(tx, n.h / 2 + 5, n.label, 'node-title', C.nodeText)).setAttribute('data-maxw', mw);
    }
    return this._withPorts(g, n);
  }

  _withPorts(g, n) {
    const ports = el('g', { class: 'ports' });
    for (const [px, py] of [[n.w / 2, 0], [n.w, n.h / 2], [n.w / 2, n.h], [0, n.h / 2]]) {
      ports.appendChild(el('circle', { class: 'port', cx: px, cy: py, r: 5, 'data-id': n.id, 'data-px': px, 'data-py': py }));
    }
    g.appendChild(ports);
    return g;
  }

  _edgeGeom(e, a, b) {
    const wp = e.points || [];
    const ca = center(a), cb = center(b);
    const ft = wp.length ? wp[0] : cb, lt = wp.length ? wp[wp.length - 1] : ca;
    const pa = anchor(a, ft.x, ft.y), pb = anchor(b, lt.x, lt.y);
    let d;
    if (wp.length) d = roundedPath([[pa.x, pa.y], ...wp.map((p) => [p.x, p.y]), [pb.x, pb.y]], 10);
    else d = e.route === 'orthogonal' ? orthPath(pa, pb) : curve(pa, pb);
    return { d, pa, pb, wp };
  }

  // default label anchor = midpoint of the middle path segment
  _edgeLabelAnchor(geom) {
    const chain = [geom.pa, ...geom.wp, geom.pb];
    const i = Math.max(0, Math.floor((chain.length - 1) / 2));
    return { x: (chain[i].x + chain[i + 1].x) / 2, y: (chain[i].y + chain[i + 1].y) / 2 };
  }

  _edgeEl(e, a, b) {
    const geom = this._edgeGeom(e, a, b);
    const { d, pa, pb, wp } = geom;
    const color = e.color || this._c.edge;
    const g = el('g', { class: 'edge-g', 'data-id': e.id, 'data-color': color, 'data-from': e.from, 'data-to': e.to });
    g.appendChild(el('path', { class: 'edge-hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': 16, 'pointer-events': 'stroke' }));
    // casing: a background-colored halo so crossing lines read clearly (which one is on top)
    g.appendChild(el('path', { class: 'edge-casing', d, fill: 'none', stroke: this._c.canvas, 'stroke-width': 6.5, 'stroke-linecap': 'round', 'pointer-events': 'none' }));
    const line = el('path', {
      class: 'edge-line', d, fill: 'none', stroke: color, 'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-dasharray': e.style === 'dashed' ? '7 6' : (e.style === 'dotted' ? '1 7' : ''),
      'marker-end': (e.dir === 'forward' || e.dir === 'both') ? 'url(#arrow)' : '',
      'marker-start': e.dir === 'both' ? 'url(#arrow)' : '',
    });
    g.appendChild(line);
    if (e.label) {
      const anc = this._edgeLabelAnchor(geom);
      const mx = anc.x + (e.lx || 0), my = anc.y + (e.ly || 0);
      const w = e.label.length * 7.2 + 12;
      const lg = el('g', { class: 'edge-label', 'data-edge': e.id });
      lg.appendChild(el('rect', { x: mx - w / 2, y: my - 9, width: w, height: 18, rx: 6, fill: this._c.canvas, opacity: 0.85 }));
      const t = text(mx, my + 4, e.label, 'edge-label-text', this._c.textDim);
      t.setAttribute('text-anchor', 'middle');
      lg.appendChild(t);
      g.appendChild(lg);
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
      const { d } = this._edgeGeom(e, a, b);
      g.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
      // labels don't reflow live; refreshed on full render
    }
  }

  // ---------- interactions ----------
  _bind() {
    let drag = null; // {mode, ...}
    const svg = this.svg;
    const capture = (id) => { try { svg.setPointerCapture(id); } catch {} };
    const ptrs = new Map();   // active pointers for pinch-zoom / two-finger pan
    let pinch = null;

    svg.addEventListener('pointerdown', (e) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {                     // second finger → start pinch, abandon single drag
        if (this._tempLink) { this._tempLink.remove(); this._tempLink = null; }
        drag = null; svg.classList.remove('panning', 'linking');
        const [a, b] = [...ptrs.values()];
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view0: { ...this.view } };
        capture(e.pointerId); return;
      }
      if (ptrs.size > 2) return;
      if (e.button === 1 || (e.button === 0 && this._space)) { // pan
        drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: this.view.tx, ty: this.view.ty };
        svg.classList.add('panning'); capture(e.pointerId); return;
      }
      if (e.button !== 0) return;
      // endpoint handle: reconnect the edge's source/target to another node
      const epEl = e.target.closest('.ep-handle');
      if (epEl) {
        const ed = this.state.edges[epEl.dataset.edge]; if (!ed) return;
        const fixedNode = this.state.nodes[epEl.dataset.end === 'from' ? ed.to : ed.from];
        drag = { mode: 'ep-move', edge: ed.id, end: epEl.dataset.end, fixed: center(fixedNode) };
        this._tempLink = el('path', { d: '', fill: 'none', stroke: (this._c && this._c.accent) || '#7c5cff', 'stroke-width': 2.4, 'stroke-dasharray': '5 5', 'marker-end': 'url(#arrow)' });
        this.$overlay.appendChild(this._tempLink);
        svg.classList.add('linking'); capture(e.pointerId); return;
      }
      // waypoint handles (drag existing bend / add a bend on a segment)
      const wpEl = e.target.closest('.wp-handle');
      const wpAdd = e.target.closest('.wp-add');
      if (wpEl) {
        drag = { mode: 'wp-move', edge: wpEl.dataset.edge, idx: +wpEl.dataset.idx, moved: false };
        capture(e.pointerId); return;
      }
      if (wpAdd) {
        const ed = this.state.edges[wpAdd.dataset.edge]; if (!ed) return;
        const w = this.screenToWorld(e.clientX, e.clientY);
        const seg = +wpAdd.dataset.seg;
        ed.points = ed.points || []; ed.points.splice(seg, 0, { x: snap(w.x), y: snap(w.y) });
        this.render(); this._refreshSelectionClasses();
        drag = { mode: 'wp-move', edge: ed.id, idx: seg, moved: true };
        capture(e.pointerId); return;
      }
      // edge label: first click selects the edge, subsequent drag moves the label
      const labelEl = e.target.closest('.edge-label');
      if (labelEl) {
        const eid = labelEl.dataset.edge;
        if (this.sel.kind === 'edge' && this.sel.id === eid) {
          const ed = this.state.edges[eid]; const na = this.state.nodes[ed.from], nb = this.state.nodes[ed.to];
          drag = { mode: 'label-move', edge: eid, anc: this._edgeLabelAnchor(this._edgeGeom(ed, na, nb)), moved: false };
          capture(e.pointerId); return;
        }
        this.select('edge', eid); return;
      }
      const handleEl = e.target.closest('.resize-handle');
      const portEl = e.target.closest('.port');
      const nodeEl = e.target.closest('.node-g');
      const edgeEl = e.target.closest('.edge-g');

      if (handleEl) {
        const id = handleEl.dataset.id;
        const n = this.state.nodes[id]; if (!n) return;
        const w = this.screenToWorld(e.clientX, e.clientY);
        drag = { mode: 'resize', id, sw: n.w, sh: n.h, ox: w.x, oy: w.y, moved: false };
        capture(e.pointerId);
        return;
      }
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
        if (e.shiftKey) { this.toggleNode(id); return; }   // shift-click adds/removes from selection
        if (this.selNodes.has(id) && this.selNodes.size > 1) {   // drag the whole multi-selection
          const w = this.screenToWorld(e.clientX, e.clientY);
          drag = { mode: 'multi', ox: w.x, oy: w.y, moved: false, items: [...this.selNodes].map((nid) => ({ id: nid, x0: this.state.nodes[nid].x, y0: this.state.nodes[nid].y })) };
          capture(e.pointerId); return;
        }
        this.select('node', id);
        const n = this.state.nodes[id];
        const w = this.screenToWorld(e.clientX, e.clientY);
        drag = { mode: 'node', id, ox: w.x - n.x, oy: w.y - n.y, moved: false };
        if (n.shape === 'group') {           // container: carry the nodes inside it
          drag.gx0 = n.x; drag.gy0 = n.y;
          drag.children = Object.values(this.state.nodes)
            .filter((m) => m.id !== id && m.shape !== 'group' && inside(n, m))
            .map((m) => ({ id: m.id, x0: m.x, y0: m.y }));
        }
        capture(e.pointerId);
        return;
      }
      if (edgeEl) { this.select('edge', edgeEl.dataset.id); return; }
      // shift + empty drag → marquee select
      if (e.shiftKey) {
        const w = this.screenToWorld(e.clientX, e.clientY);
        drag = { mode: 'marquee', x0: w.x, y0: w.y, add: [...this.selNodes] };
        this._marquee = el('rect', { class: 'marquee', x: w.x, y: w.y, width: 0, height: 0, fill: mix((this._c && this._c.accent) || '#4d8dff', 12), stroke: (this._c && this._c.accent) || '#4d8dff', 'stroke-width': 1 / this.view.k, 'stroke-dasharray': `${4 / this.view.k} ${3 / this.view.k}`, 'pointer-events': 'none' });
        this.$overlay.appendChild(this._marquee);
        capture(e.pointerId); return;
      }
      // empty → pan + deselect
      this.select(null, null);
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: this.view.tx, ty: this.view.ty };
      svg.classList.add('panning'); capture(e.pointerId);
    });

    svg.addEventListener('pointermove', (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size >= 2) {            // pinch-zoom + two-finger pan
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const r = this.svg.getBoundingClientRect();
        const sx = pinch.mid0.x - r.left, sy = pinch.mid0.y - r.top;
        const k2 = clamp(pinch.view0.k * (d / pinch.d0), 0.15, 3.5);
        const f = k2 / pinch.view0.k;
        this.view.tx = sx - (sx - pinch.view0.tx) * f + (mid.x - pinch.mid0.x);
        this.view.ty = sy - (sy - pinch.view0.ty) * f + (mid.y - pinch.mid0.y);
        this.view.k = k2;
        this._applyView();
        return;
      }
      if (!drag) { return; }
      if (drag.mode === 'pan') {
        this.view.tx = drag.tx + (e.clientX - drag.sx);
        this.view.ty = drag.ty + (e.clientY - drag.sy);
        this._applyView();
      } else if (drag.mode === 'wp-move') {
        const ed = this.state.edges[drag.edge]; if (!ed || !ed.points[drag.idx]) return;
        const w = this.screenToWorld(e.clientX, e.clientY);
        ed.points[drag.idx] = { x: snap(w.x), y: snap(w.y) };
        drag.moved = true;
        this.render(); this._refreshSelectionClasses();
      } else if (drag.mode === 'ep-move') {
        const w = this.screenToWorld(e.clientX, e.clientY);
        this._tempLink.setAttribute('d', curve({ x: drag.fixed.x, y: drag.fixed.y, dir: { x: 0, y: 0 } }, { x: w.x, y: w.y, dir: { x: 0, y: 0 } }));
      } else if (drag.mode === 'label-move') {
        const w = this.screenToWorld(e.clientX, e.clientY);
        const ed = this.state.edges[drag.edge]; if (!ed) return;
        ed.lx = snap(w.x - drag.anc.x); ed.ly = snap(w.y - drag.anc.y);
        drag.moved = true;
        this.render(); this._refreshSelectionClasses();
      } else if (drag.mode === 'node') {
        const w = this.screenToWorld(e.clientX, e.clientY);
        const n = this.state.nodes[drag.id];
        n.x = snap(w.x - drag.ox); n.y = snap(w.y - drag.oy);
        this._showGuides(this._alignSnap(n));   // snap edges/centers to other nodes
        drag.moved = true;
        const g = this.$nodes.querySelector(`.node-g[data-id="${drag.id}"]`);
        if (g) g.setAttribute('transform', `translate(${n.x} ${n.y})`);
        this._updateNodeEdges(drag.id);
        if (drag.children) {                 // move contained nodes by the group's exact delta
          const ddx = n.x - drag.gx0, ddy = n.y - drag.gy0;
          for (const c of drag.children) {
            const m = this.state.nodes[c.id]; if (!m) continue;
            m.x = c.x0 + ddx; m.y = c.y0 + ddy;
            const cg = this.$nodes.querySelector(`.node-g[data-id="${c.id}"]`);
            if (cg) cg.setAttribute('transform', `translate(${m.x} ${m.y})`);
            this._updateNodeEdges(c.id);
          }
        }
      } else if (drag.mode === 'multi') {
        const w = this.screenToWorld(e.clientX, e.clientY);
        const ddx = snap(w.x - drag.ox), ddy = snap(w.y - drag.oy);
        drag.moved = true;
        for (const it of drag.items) {
          const m = this.state.nodes[it.id]; if (!m) continue;
          m.x = it.x0 + ddx; m.y = it.y0 + ddy;
          const cg = this.$nodes.querySelector(`.node-g[data-id="${it.id}"]`);
          if (cg) cg.setAttribute('transform', `translate(${m.x} ${m.y})`);
          this._updateNodeEdges(it.id);
        }
      } else if (drag.mode === 'marquee') {
        const w = this.screenToWorld(e.clientX, e.clientY);
        const x = Math.min(drag.x0, w.x), y = Math.min(drag.y0, w.y);
        this._marquee.setAttribute('x', x); this._marquee.setAttribute('y', y);
        this._marquee.setAttribute('width', Math.abs(w.x - drag.x0)); this._marquee.setAttribute('height', Math.abs(w.y - drag.y0));
      } else if (drag.mode === 'resize') {
        const w = this.screenToWorld(e.clientX, e.clientY);
        const n = this.state.nodes[drag.id];
        const big = n.shape === 'group' || n.shape === 'band';
        n.w = Math.max(big ? 120 : 70, snap(drag.sw + (w.x - drag.ox)));
        n.h = Math.max(big ? 80 : 34, snap(drag.sh + (w.y - drag.oy)));
        drag.moved = true;
        this.render();
      } else if (drag.mode === 'link') {
        const w = this.screenToWorld(e.clientX, e.clientY);
        this._tempLink.setAttribute('d', curve({ x: drag.start.x, y: drag.start.y, dir: { x: 0, y: 0 } }, { x: w.x, y: w.y, dir: { x: 0, y: 0 } }));
      }
    });

    const end = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      this._showGuides(null);
      if (!drag) { svg.classList.remove('panning', 'linking'); return; }
      if (drag.mode === 'node' && drag.moved) { this.render(); this._pushHistory(); }
      if (drag.mode === 'multi' && drag.moved) { this.render(); this._pushHistory(); }
      if (drag.mode === 'resize' && drag.moved) { this._pushHistory(); }
      if (drag.mode === 'wp-move' && drag.moved) { this._pushHistory(); }
      if (drag.mode === 'label-move' && drag.moved) { this._pushHistory(); }
      if (drag.mode === 'ep-move') {
        this._tempLink?.remove(); this._tempLink = null;
        const tgt = document.elementFromPoint(e.clientX, e.clientY);
        const tn = tgt && tgt.closest && tgt.closest('.node-g');
        const ed = this.state.edges[drag.edge];
        if (ed && tn) {
          const newId = tn.dataset.id, other = drag.end === 'from' ? ed.to : ed.from;
          if (newId !== other) { if (drag.end === 'from') ed.from = newId; else ed.to = newId; this._pushHistory(); }
        }
        this.render(); this._refreshSelectionClasses();
      }
      if (drag.mode === 'marquee') {
        const mx = +this._marquee.getAttribute('x'), my = +this._marquee.getAttribute('y');
        const mw = +this._marquee.getAttribute('width'), mh = +this._marquee.getAttribute('height');
        this._marquee.remove(); this._marquee = null;
        const hit = new Set(drag.add);
        if (mw > 3 || mh > 3) {
          for (const n of Object.values(this.state.nodes)) {
            if (n.x < mx + mw && n.x + n.w > mx && n.y < my + mh && n.y + n.h > my) hit.add(n.id);
          }
        }
        this.selectNodes([...hit]);
      }
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

    // double click a node → edit label event; double click a waypoint → remove it
    svg.addEventListener('dblclick', (e) => {
      const wpEl = e.target.closest('.wp-handle');
      if (wpEl) { const ed = this.state.edges[wpEl.dataset.edge]; if (ed && ed.points) { ed.points.splice(+wpEl.dataset.idx, 1); this._pushHistory(); this.render(); this._refreshSelectionClasses(); } return; }
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

  // layered left-to-right auto layout based on edge direction
  autoLayout() {
    const skip = new Set(['group', 'band', 'banner']);
    const nodes = Object.values(this.state.nodes).filter((n) => !skip.has(n.shape));
    if (!nodes.length) return;
    const idset = new Set(nodes.map((n) => n.id));
    const edges = Object.values(this.state.edges).filter((e) => idset.has(e.from) && idset.has(e.to) && e.from !== e.to);
    const indeg = {}, adj = {};
    nodes.forEach((n) => { indeg[n.id] = 0; adj[n.id] = []; });
    edges.forEach((e) => { adj[e.from].push(e.to); indeg[e.to] = (indeg[e.to] || 0) + 1; });
    let roots = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
    if (!roots.length) roots = [nodes[0].id];       // cyclic fallback
    const layer = {}; roots.forEach((id) => (layer[id] = 0));
    const indeg2 = { ...indeg }; const q = [...roots]; const seen = new Set(roots);
    while (q.length) {
      const u = q.shift();
      for (const v of adj[u]) {
        layer[v] = Math.max(layer[v] ?? 0, (layer[u] ?? 0) + 1);
        if (--indeg2[v] <= 0 && !seen.has(v)) { seen.add(v); q.push(v); }
      }
    }
    let maxL = 0; Object.values(layer).forEach((l) => (maxL = Math.max(maxL, l)));
    nodes.forEach((n) => { if (layer[n.id] == null) layer[n.id] = ++maxL; });
    const cols = {};
    nodes.forEach((n) => { (cols[layer[n.id]] ||= []).push(n); });
    const colW = NODE_W + 132, rowH = NODE_H + 46;
    let maxRows = 0; Object.values(cols).forEach((c) => (maxRows = Math.max(maxRows, c.length)));
    const totalH = maxRows * rowH;
    Object.keys(cols).map(Number).sort((a, b) => a - b).forEach((L) => {
      const col = cols[L].sort((a, b) => a.y - b.y);
      const colH = col.length * rowH;
      col.forEach((n, i) => { n.x = snap(80 + L * colW); n.y = snap(80 + (totalH - colH) / 2 + i * rowH); });
    });
    this._pushHistory(); this.render(); this.fitView();
  }

  // move all selected nodes by a delta (keyboard nudge)
  nudge(dx, dy) {
    if (!this.selNodes.size) return;
    for (const id of this.selNodes) { const n = this.state.nodes[id]; if (n) { n.x += dx; n.y += dy; } }
    this.render(); this._pushHistory();
  }

  // z-order controls
  bringToFront(id = this.sel.id) { if (!this.state.nodes[id]) return; this.state.order = this.state.order.filter((x) => x !== id); this.state.order.push(id); this._pushHistory(); this.render(); }
  sendToBack(id = this.sel.id) { if (!this.state.nodes[id]) return; this.state.order = this.state.order.filter((x) => x !== id); this.state.order.unshift(id); this._pushHistory(); this.render(); }

  // grow a zone/container to enclose the nodes inside it
  fitZoneToChildren(id = this.sel.id) {
    const z = this.state.nodes[id]; if (!z || z.shape !== 'group') return;
    const kids = Object.values(this.state.nodes).filter((m) => m.id !== id && m.shape !== 'group' && inside(z, m));
    if (!kids.length) return;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    kids.forEach((m) => { minx = Math.min(minx, m.x); miny = Math.min(miny, m.y); maxx = Math.max(maxx, m.x + m.w); maxy = Math.max(maxy, m.y + m.h); });
    z.x = snap(minx - 16); z.y = snap(miny - 44); z.w = snap(maxx - minx + 32); z.h = snap(maxy - miny + 60);
    this._pushHistory(); this.render();
  }

  // grid-arrange the nodes inside a zone, then fit the zone to them
  arrangeZone(id = this.sel.id) {
    const z = this.state.nodes[id]; if (!z || z.shape !== 'group') return;
    const kids = Object.values(this.state.nodes).filter((m) => m.id !== id && m.shape !== 'group' && inside(z, m));
    if (!kids.length) return;
    kids.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const padX = 16, padTop = 42, gapX = 20, gapY = 16;
    const maxW = Math.max(...kids.map((k) => k.w)), maxH = Math.max(...kids.map((k) => k.h));
    const cols = Math.max(1, Math.floor((z.w - padX * 2 + gapX) / (maxW + gapX)));
    kids.forEach((k, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      k.x = snap(z.x + padX + col * (maxW + gapX));
      k.y = snap(z.y + padTop + row * (maxH + gapY));
    });
    this.fitZoneToChildren(id);   // pushes history + renders
  }

  // snap the dragged node's edges/centers to other nodes; returns guide lines to draw
  _alignSnap(n) {
    const thr = 6;
    const nx = [n.x, n.x + n.w / 2, n.x + n.w], ny = [n.y, n.y + n.h / 2, n.y + n.h];
    let bx = null, by = null;
    for (const m of Object.values(this.state.nodes)) {
      if (m.id === n.id) continue;
      const mx = [m.x, m.x + m.w / 2, m.x + m.w], my = [m.y, m.y + m.h / 2, m.y + m.h];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const dx = mx[j] - nx[i]; if (Math.abs(dx) < thr && (!bx || Math.abs(dx) < Math.abs(bx.d))) bx = { d: dx, at: mx[j] };
        const dy = my[j] - ny[i]; if (Math.abs(dy) < thr && (!by || Math.abs(dy) < Math.abs(by.d))) by = { d: dy, at: my[j] };
      }
    }
    const guides = [];
    if (bx) { n.x += bx.d; guides.push({ t: 'v', at: bx.at }); }
    if (by) { n.y += by.d; guides.push({ t: 'h', at: by.at }); }
    return guides;
  }

  _showGuides(guides) {
    this.$overlay.querySelectorAll('.align-guide').forEach((e) => e.remove());
    if (!guides || !guides.length) return;
    const b = this.contentBBox(240), sw = 1 / this.view.k, col = (this._c && this._c.accent) || '#4d8dff';
    for (const g of guides) {
      const a = g.t === 'v'
        ? { x1: g.at, y1: b.y, x2: g.at, y2: b.y + b.h }
        : { x1: b.x, y1: g.at, x2: b.x + b.w, y2: g.at };
      this.$overlay.appendChild(el('line', { class: 'align-guide', ...a, stroke: col, 'stroke-width': sw, 'stroke-dasharray': `${4 * sw} ${4 * sw}`, 'pointer-events': 'none', opacity: 0.95 }));
    }
  }

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
// is node m's center within group g's rect?
function inside(g, m) {
  const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
  return cx > g.x && cx < g.x + g.w && cy > g.y && cy < g.y + g.h;
}
function snap(v) { return Math.round(v / SNAP) * SNAP; }
// 1-2 char initials for logo tiles (ASCII first letters, else first glyph)
function initials(s) {
  const str = String(s || '?').trim();
  const ascii = str.replace(/[^A-Za-z0-9 ]/g, '').trim();
  if (ascii) {
    const parts = ascii.split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
  }
  return str.slice(0, 1);
}
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

// orthogonal (right-angle) connector with rounded corners
function orthPath(a, b) {
  const pad = 20;
  const ax = a.x + a.dir.x * pad, ay = a.y + a.dir.y * pad;
  const bx = b.x + b.dir.x * pad, by = b.y + b.dir.y * pad;
  let pts;
  if (a.dir.x !== 0) {
    const midx = (ax + bx) / 2;
    pts = b.dir.x !== 0
      ? [[a.x, a.y], [ax, ay], [midx, ay], [midx, by], [bx, by], [b.x, b.y]]
      : [[a.x, a.y], [ax, ay], [bx, ay], [bx, by], [b.x, b.y]];
  } else {
    const midy = (ay + by) / 2;
    pts = b.dir.y !== 0
      ? [[a.x, a.y], [ax, ay], [ax, midy], [bx, midy], [bx, by], [b.x, b.y]]
      : [[a.x, a.y], [ax, ay], [ax, by], [bx, by], [b.x, b.y]];
  }
  return roundedPath(dedupe(pts), 9);
}
function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = out[out.length - 1], [x, y] = pts[i];
    if (Math.abs(px - x) > 0.5 || Math.abs(py - y) > 0.5) out.push(pts[i]);
  }
  return out;
}
function roundedPath(pts, r) {
  if (pts.length < 3) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const v1x = x1 - x0, v1y = y1 - y0, v2x = x2 - x1, v2y = y2 - y1;
    const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L ${(x1 - v1x / l1 * rr).toFixed(1)} ${(y1 - v1y / l1 * rr).toFixed(1)} Q ${x1} ${y1} ${(x1 + v2x / l2 * rr).toFixed(1)} ${(y1 + v2y / l2 * rr).toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last[0]} ${last[1]}`;
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
