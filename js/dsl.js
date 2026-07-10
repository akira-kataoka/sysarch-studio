// Diagram-as-Code: a small, forgiving text DSL <-> editor state.
//   parseDSL(text, typeInfo)  -> { version:1, state:{ nodes, edges, order, counter } }
//   serializeDSL(state, typeInfo) -> text
// Both are PURE (typeInfo injected) so they can be unit-tested without a DOM.
//
// Grammar (line based; blank / # / // lines ignored):
//   title <text>                     → a banner heading
//   zone <label> {                   → a titled container; member node lines until a closing }
//       sf: salesforce [Salesforce]  → node: id ":" type "[" label "]" "|" sub  (type/label/sub optional)
//       gw: gateway [API GW] | 認証   → sub after "|"
//   }
//   sf -> gw : HTTPS                 → edge (see EDGE_TOKENS); label after ":"
// Edge operators: -> solid  --> dashed  ..> dotted  <-> both  <--> dashed-both  <..> dotted-both
//                 --- line(no arrow)  <- reversed

const EDGE_TOKENS = [
  ['<-->', { style: 'dashed', dir: 'both' }],
  ['<..>', { style: 'dotted', dir: 'both' }],
  ['<->',  { style: 'solid',  dir: 'both' }],
  ['-->',  { style: 'dashed', dir: 'forward' }],
  ['..>',  { style: 'dotted', dir: 'forward' }],
  ['---',  { style: 'solid',  dir: 'none' }],
  ['->',   { style: 'solid',  dir: 'forward' }],
  ['<-',   { style: 'solid',  dir: 'forward', swap: true }],
];

const ZONE_COLORS = ['#5b9dff', '#7c5cff', '#43d19e', '#ffb454', '#4dd0e1', '#c084fc', '#ff5c7c'];

// layout constants
const L = { left: 28, node_w: 180, node_h: 64, vgap: 22, zpad: 16, zhead: 42, colgap: 46, bannerH: 52 };

const unescNL = (s) => String(s).replace(/\\n/g, '\n');
const escNL = (s) => String(s).replace(/\n/g, '\\n');

// find the edge operator that appears outside of [...] label brackets; null if none
function edgeOpOf(line) {
  const bare = line.replace(/\[[^\]]*\]/g, '');
  for (const [tok, spec] of EDGE_TOKENS) if (bare.includes(tok)) return { tok, spec };
  return null;
}

function parseNodeDecl(line) {
  const m = /^([^\s:\[\|]+)\s*(?::\s*([^\s\[\|]+))?\s*(?:\[([^\]]*)\])?\s*(?:\|\s*(.*))?$/.exec(line.trim());
  if (!m) return null;
  return { id: m[1], type: m[2] || '', label: m[3] != null ? unescNL(m[3].trim()) : '', sub: m[4] != null ? unescNL(m[4].trim()) : '' };
}

// text → intermediate model { title, zones:[{id,label,ids:[]}], nodes:Map(id→decl), edges:[] }
function toModel(text) {
  const lines = String(text || '').split(/\r?\n/);
  const nodes = new Map();       // id → {id,type,label,sub}
  const zoneOf = new Map();      // node id → zone id
  const zones = [];              // {id, label}
  const edges = [];
  let title = '';
  let zi = 0, ei = 0;
  let curZone = null;

  const ensure = (id) => { if (!nodes.has(id)) nodes.set(id, { id, type: '', label: '', sub: '' }); return nodes.get(id); };

  for (let raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    if (curZone && line === '}') { curZone = null; continue; }

    const mTitle = /^title\s+(.*)$/i.exec(line);
    if (mTitle) { title = unescNL(mTitle[1].trim()); continue; }

    const mZone = /^zone\b\s*(.*?)\s*\{\s*$/i.exec(line);
    if (mZone) { const id = 'z' + (++zi); zones.push({ id, label: unescNL(mZone[1].trim()) || ('ゾーン' + zi) }); curZone = id; continue; }

    const eop = edgeOpOf(line);
    if (eop) {
      const idx = line.indexOf(eop.tok);
      let from = line.slice(0, idx).trim();
      let rest = line.slice(idx + eop.tok.length);
      const ci = rest.indexOf(':');
      let to = (ci >= 0 ? rest.slice(0, ci) : rest).trim();
      const label = ci >= 0 ? unescNL(rest.slice(ci + 1).trim()) : '';
      if (!from || !to) continue;
      if (eop.spec.swap) { const t = from; from = to; to = t; }
      ensure(from); ensure(to);
      edges.push({ id: 'e' + (++ei), from, to, label, style: eop.spec.style, dir: eop.spec.dir, route: 'orthogonal', color: '' });
      continue;
    }

    const decl = parseNodeDecl(line);
    if (!decl) continue;
    const n = ensure(decl.id);
    if (decl.type) n.type = decl.type;
    if (decl.label) n.label = decl.label;
    if (decl.sub) n.sub = decl.sub;
    if (curZone && !zoneOf.has(decl.id)) zoneOf.set(decl.id, curZone);
  }
  return { title, zones, zoneOf, nodes, edges };
}

// intermediate model → laid-out state
export function parseDSL(text, typeInfo) {
  const model = toModel(text);
  const info = (t) => typeInfo(t || 'generic');
  const state = { nodes: {}, edges: {}, order: [], counter: 0 };
  const zoneIds = [], mid = [], front = [];

  const mkNode = (decl) => {
    const t = decl.type || 'generic';
    const i = info(t);
    const label = decl.label || i.label || decl.id;
    return { id: decl.id, type: t, x: 0, y: 0, w: L.node_w, h: L.node_h, label, sub: decl.sub || '', color: i.color || '#94a3b8', shape: i.shape || 'card' };
  };

  // group members by zone (declaration order preserved via Map iteration)
  const byZone = new Map();       // zoneId → [decl,...]
  const loose = [];
  for (const decl of model.nodes.values()) {
    const z = model.zoneOf.get(decl.id);
    if (z) { if (!byZone.has(z)) byZone.set(z, []); byZone.get(z).push(decl); }
    else loose.push(decl);
  }

  const top = model.title ? 16 + L.bannerH + 24 : 28;
  let colX = L.left;

  // title banner
  if (model.title) {
    const w = Math.max(320, model.title.length * 15 + 40);
    state.nodes['title'] = { id: 'title', type: 'banner', x: L.left, y: 16, w, h: L.bannerH, label: model.title, sub: '', color: '#4d8dff', shape: 'banner' };
    front.push('title');
  }

  // zones as columns
  model.zones.forEach((z, zIdx) => {
    const members = byZone.get(z.id) || [];
    const count = Math.max(1, members.length);
    const zoneW = L.node_w + L.zpad * 2;
    const zoneH = L.zhead + L.zpad + count * L.node_h + (count - 1) * L.vgap + L.zpad;
    const color = ZONE_COLORS[zIdx % ZONE_COLORS.length];
    state.nodes[z.id] = { id: z.id, type: 'zone', x: colX, y: top, w: zoneW, h: zoneH, label: z.label, sub: '', color, shape: 'group' };
    zoneIds.push(z.id);
    members.forEach((decl, i) => {
      const n = mkNode(decl);
      n.x = colX + L.zpad;
      n.y = top + L.zhead + L.zpad + i * (L.node_h + L.vgap);
      state.nodes[n.id] = n; mid.push(n.id);
    });
    colX += zoneW + L.colgap;
  });

  // loose nodes: one trailing column
  loose.forEach((decl, i) => {
    const n = mkNode(decl);
    n.x = colX;
    n.y = top + L.zhead + L.zpad + i * (L.node_h + L.vgap);
    state.nodes[n.id] = n; mid.push(n.id);
  });

  // edges
  for (const e of model.edges) { if (state.nodes[e.from] && state.nodes[e.to]) state.edges[e.id] = e; }

  state.order = [...zoneIds, ...mid, ...front];
  return { version: 1, state };
}

// ---- serialize: state → text ----
function centerInside(g, n) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  return cx > g.x && cx < g.x + g.w && cy > g.y && cy < g.y + g.h;
}
function opFor(e) {
  const dir = e.dir || 'forward', style = e.style || 'solid';
  if (dir === 'both') return style === 'dashed' ? '<-->' : style === 'dotted' ? '<..>' : '<->';
  if (dir === 'none') return '---';
  return style === 'dashed' ? '-->' : style === 'dotted' ? '..>' : '->';
}
function nodeLine(n) {
  let s = n.id;
  if (n.type && n.type !== 'generic') s += ': ' + n.type;
  if (n.label) s += ' [' + escNL(n.label) + ']';
  if (n.sub) s += ' | ' + escNL(n.sub);
  return s;
}

export function serializeDSL(state) {
  const nodes = Object.values(state.nodes || {});
  const groups = nodes.filter((n) => n.shape === 'group').sort((a, b) => a.x - b.x || a.y - b.y);
  const banners = nodes.filter((n) => n.shape === 'banner');
  const rest = nodes.filter((n) => n.shape !== 'group' && n.shape !== 'banner');

  const claimed = new Set();
  const memberships = groups.map((g) => {
    const mem = rest.filter((n) => !claimed.has(n.id) && centerInside(g, n)).sort((a, b) => a.y - b.y || a.x - b.x);
    mem.forEach((n) => claimed.add(n.id));
    return { g, mem };
  });
  const loose = rest.filter((n) => !claimed.has(n.id)).sort((a, b) => a.x - b.x || a.y - b.y);

  const out = [];
  for (const b of banners) out.push('title ' + escNL(b.label || ''));
  if (banners.length) out.push('');
  for (const { g, mem } of memberships) {
    out.push('zone ' + escNL(g.label || '') + ' {');
    for (const n of mem) out.push('  ' + nodeLine(n));
    out.push('}');
    out.push('');
  }
  for (const n of loose) out.push(nodeLine(n));
  if (loose.length) out.push('');

  const edges = Object.values(state.edges || {});
  for (const e of edges) {
    if (!state.nodes[e.from] || !state.nodes[e.to]) continue;
    out.push(e.from + ' ' + opFor(e) + ' ' + e.to + (e.label ? ' : ' + escNL(e.label) : ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
