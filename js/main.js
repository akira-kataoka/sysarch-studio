// App wiring: palette, toolbar, inspector, keyboard, minimap, demo, export.
import { initBackground } from './background.js?v=7';
import { Editor } from './editor.js?v=7';
import { GROUPS, TYPE_MAP, PALETTE_COLORS, typeInfo } from './nodes.js?v=7';
import { iconSvg } from './icons.js?v=7';
import { BRAND_ICONS } from './brands.js?v=7';
import { exportSVG, exportPNG, copyPNG, exportPDF } from './export.js?v=7';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const palInitials = (s) => {
  const a = String(s || '?').replace(/[^A-Za-z0-9 ]/g, '').trim();
  if (!a) return String(s).slice(0, 1);
  const p = a.split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
};
const svg = $('#canvas');
const editor = new Editor(svg);
window.__editor = editor; // debug / tooling handle

/* ---------------- theme + background ---------------- */
let bg = { setTheme() {}, setPalette() {} };

const THEMES = [
  { id: 'midnight-blueprint', name: 'Midnight Blueprint', tag: '技術ブルー',       mode: 'dark',  pt: '#4d8dff', ln: '#38d5c0' },
  { id: 'abyssal-teal',       name: 'Abyssal Teal',       tag: '深海ティール',     mode: 'dark',  pt: '#2dd4bf', ln: '#6ab7ff' },
  { id: 'violet-noir',        name: 'Violet Noir',        tag: '夜想の紫',         mode: 'dark',  pt: '#b06bff', ln: '#ff6ea9' },
  { id: 'graphite-ember',     name: 'Graphite Ember',     tag: '暖色グラファイト', mode: 'dark',  pt: '#e0a04b', ln: '#d97b5c' },
  { id: 'light',              name: 'ライト',             tag: '明るい配色',       mode: 'light', pt: '#2f6fe0', ln: '#12a3bb' },
];

function resolveInitialTheme() {
  const saved = localStorage.getItem('sysarch:theme');
  if (saved === 'dark') return 'midnight-blueprint';      // migrate old value
  if (THEMES.some((t) => t.id === saved)) return saved;
  return 'midnight-blueprint';
}
let themeId = resolveInitialTheme();

function applyThemeDom(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  const root = document.documentElement;
  if (t.mode === 'light') { root.dataset.theme = 'light'; delete root.dataset.variant; }
  else { root.dataset.theme = 'dark'; if (t.id === 'midnight-blueprint') delete root.dataset.variant; else root.dataset.variant = t.id; }
  localStorage.setItem('sysarch:theme', id);
  themeId = id;
}

function applyTheme(id) {
  applyThemeDom(id);
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  editor.render();               // recolor the diagram for the new palette
  bg.setPalette(t.pt, t.ln, t.mode);
  buildThemeMenu();
}

function buildThemeMenu() {
  const m = $('#theme-menu');
  if (!m) return;
  m.innerHTML = THEMES.map((t) =>
    `<button data-theme-id="${t.id}">${t.id === themeId ? '● ' : ''}${t.name} <em>${t.tag}</em></button>`).join('');
}

applyThemeDom(themeId);          // set attributes early to avoid a flash
buildThemeMenu();
initBackground().then((b) => { bg = b; const t = THEMES.find((x) => x.id === themeId) || THEMES[0]; bg.setPalette(t.pt, t.ln, t.mode); });

/* ---------------- palette ---------------- */
function buildPalette() {
  const body = $('#palette-body');
  body.innerHTML = GROUPS.map((g) => `
    <div class="pal-group" data-group="${g.id}">
      <div class="pal-group-title" style="--gcolor:${g.color}">${g.title}</div>
      <div class="pal-items">
        ${g.types.map((t) => `
          <div class="pal-item" draggable="true" data-type="${t.id}" style="--ncolor:${t.color}" title="${t.label}">
            ${t.logo
              ? (BRAND_ICONS[t.id]
                  ? `<div class="pi-icon pi-logo" style="background:${BRAND_ICONS[t.id].hex};border-color:${BRAND_ICONS[t.id].hex}"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="${BRAND_ICONS[t.id].path}"/></svg></div>`
                  : `<div class="pi-icon pi-logo" style="background:${t.color};color:#fff;border-color:${t.color}">${palInitials(t.label)}</div>`)
              : `<div class="pi-icon">${iconSvg(t.icon, 18)}</div>`}
            <div class="pi-label">${t.label}</div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  body.querySelectorAll('.pal-item').forEach((item) => {
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/type', item.dataset.type);
      e.dataTransfer.setData('text/plain', item.dataset.type);
      e.dataTransfer.effectAllowed = 'copy';
    });
    // click to drop at center
    item.addEventListener('click', () => {
      const r = svg.getBoundingClientRect();
      const w = editor.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
      editor.addNode(item.dataset.type, w.x, w.y);
      toast(`「${typeInfo(item.dataset.type).label}」を追加`);
    });
  });
}
buildPalette();

$('#palette-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.pal-group').forEach((grp) => {
    let visible = 0;
    grp.querySelectorAll('.pal-item').forEach((it) => {
      const hit = !q || TYPE_MAP[it.dataset.type].label.toLowerCase().includes(q) || it.dataset.type.includes(q);
      it.style.display = hit ? '' : 'none';
      if (hit) visible++;
    });
    grp.style.display = visible ? '' : 'none';
  });
});

// drag & drop onto canvas
svg.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
svg.addEventListener('drop', (e) => {
  e.preventDefault();
  const type = e.dataTransfer.getData('text/type') || e.dataTransfer.getData('text/plain');
  if (!type || !TYPE_MAP[type]) return;
  const w = editor.screenToWorld(e.clientX, e.clientY);
  editor.addNode(type, w.x, w.y);
});

/* ---------------- toolbar ---------------- */
document.querySelector('.topbar-actions').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  switch (act) {
    case 'undo': editor.undo(); break;
    case 'redo': editor.redo(); break;
    case 'zoom-in': editor.zoomBy(1.2); break;
    case 'zoom-out': editor.zoomBy(1 / 1.2); break;
    case 'zoom-fit': editor.fitView(); break;
    case 'grid': { const on = editor.toggleGrid(); btn.classList.toggle('is-on', on); break; }
    case 'layout': editor.autoLayout(); toast('自動整列しました'); break;
    case 'samples': { const m = $('#samples-menu'); m.hidden = !m.hidden; $('#theme-menu').hidden = true; $('#export-menu').hidden = true; break; }
    case 'theme-menu': { const m = $('#theme-menu'); m.hidden = !m.hidden; $('#export-menu').hidden = true; $('#samples-menu').hidden = true; break; }
    case 'save': saveFile(); break;
    case 'load': $('#file-input').click(); break;
    case 'export': toggleExportMenu(); break;
  }
});

$('#export-menu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-export]'); if (!b) return;
  const kind = b.dataset.export;
  $('#export-menu').hidden = true;
  if (!Object.keys(editor.state.nodes).length) { toast('図が空です', 'err'); return; }
  try {
    if (kind === 'svg') { exportSVG(editor); toast('SVG を書き出しました', 'ok'); }
    else if (kind === 'png') { await exportPNG(editor, 2); toast('PNG (2x) を書き出しました', 'ok'); }
    else if (kind === 'png4') { await exportPNG(editor, 4); toast('PNG (4x) を書き出しました', 'ok'); }
    else if (kind === 'pdf') { await exportPDF(editor, 2); toast('PDF を書き出しました', 'ok'); }
    else if (kind === 'clipboard') { await copyPNG(editor, 2); toast('PNG をクリップボードにコピー', 'ok'); }
  } catch (err) { console.error(err); toast('書き出しに失敗: ' + err.message, 'err'); }
});

function toggleExportMenu() {
  const m = $('#export-menu');
  m.hidden = !m.hidden;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-wrap')) { $('#export-menu').hidden = true; $('#theme-menu').hidden = true; $('#samples-menu').hidden = true; }
});

$('#samples-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sample]'); if (!b) return;
  $('#samples-menu').hidden = true;
  editor.loadJSON(b.dataset.sample === 'integration' ? demoIntegration() : demoDiagram());
  toast(b.dataset.sample === 'integration' ? '連携図サンプルを読み込みました' : '構成図サンプルを読み込みました', 'ok');
});

$('#theme-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-id]'); if (!b) return;
  applyTheme(b.dataset.themeId);
  $('#theme-menu').hidden = true;
  toast(`テーマ: ${THEMES.find((t) => t.id === b.dataset.themeId)?.name || ''}`);
});

/* ---------------- inspector ---------------- */
const inspEmpty = $('#insp-empty');
const inspBody = $('#insp-body');

editor.on('select', renderInspector);
editor.on('editlabel', () => { const el = inspBody.querySelector('#f-label'); if (el) { el.focus(); el.select(); } });

function renderInspector(sel) {
  if (!sel || !sel.kind) { inspEmpty.hidden = false; inspBody.hidden = true; inspBody.innerHTML = ''; return; }
  inspEmpty.hidden = true; inspBody.hidden = false;
  if (sel.kind === 'node') renderNodeInspector(editor.state.nodes[sel.id]);
  else renderEdgeInspector(editor.state.edges[sel.id]);
}

function swatchRow(active) {
  return `<div class="swatches">${PALETTE_COLORS.map((c) =>
    `<div class="swatch${c === active ? ' is-active' : ''}" style="background:${c}" data-color="${c}"></div>`).join('')}</div>`;
}

function renderNodeInspector(n) {
  if (!n) return;
  const info = typeInfo(n.type);
  inspBody.innerHTML = `
    <div class="insp-section">
      <h3>${info.groupTitle || 'ノード'} · ${info.label}</h3>
      <div class="field"><label>ラベル</label><input id="f-label" type="text" value="${esc(n.label)}" /></div>
      <div class="field"><label>補足（サブテキスト）</label><input id="f-sub" type="text" value="${esc(n.sub)}" placeholder="例: Nginx / t3.medium" /></div>
      <div class="field"><label>種別</label><select id="f-type">
        ${GROUPS.map((g) => `<optgroup label="${g.title}">${g.types.map((t) =>
          `<option value="${t.id}"${t.id === n.type ? ' selected' : ''}>${t.label}</option>`).join('')}</optgroup>`).join('')}
      </select></div>
    </div>
    <div class="insp-section">
      <h3>アクセント色</h3>
      ${swatchRow(n.color)}
    </div>
    <div class="insp-section">
      <h3>操作</h3>
      <div class="btn-row">
        <button class="chip-btn" data-op="dup">⧉ 複製</button>
        <button class="chip-btn danger" data-op="del">🗑 削除</button>
      </div>
    </div>`;

  const label = $('#f-label', inspBody), sub = $('#f-sub', inspBody), type = $('#f-type', inspBody);
  label.addEventListener('input', () => editor.applyPatch({ label: label.value }, false));
  label.addEventListener('change', () => editor.commit());
  sub.addEventListener('input', () => editor.applyPatch({ sub: sub.value }, false));
  sub.addEventListener('change', () => editor.commit());
  type.addEventListener('change', () => { editor.updateSelected({ type: type.value }); });

  inspBody.querySelectorAll('.swatch').forEach((s) => s.addEventListener('click', () => {
    editor.applyPatch({ color: s.dataset.color });
    inspBody.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('is-active', x === s));
  }));
  bindOps();
}

function renderEdgeInspector(e) {
  if (!e) return;
  const a = editor.state.nodes[e.from], b = editor.state.nodes[e.to];
  inspBody.innerHTML = `
    <div class="insp-section">
      <h3>接続</h3>
      <div class="field" style="font-size:12px;color:var(--text-dim)">${esc(a?.label || '?')} → ${esc(b?.label || '?')}</div>
      <div class="field"><label>ラベル</label><input id="e-label" type="text" value="${esc(e.label)}" placeholder="例: HTTPS / gRPC / SQL" /></div>
    </div>
    <div class="insp-section">
      <h3>向き</h3>
      <div class="btn-row" id="e-dir">
        <button class="chip-btn${e.dir === 'forward' ? ' is-active' : ''}" data-dir="forward">→ 片方向</button>
        <button class="chip-btn${e.dir === 'both' ? ' is-active' : ''}" data-dir="both">↔ 双方向</button>
        <button class="chip-btn${e.dir === 'none' ? ' is-active' : ''}" data-dir="none">— なし</button>
      </div>
    </div>
    <div class="insp-section">
      <h3>線種</h3>
      <div class="btn-row" id="e-style">
        <button class="chip-btn${e.style === 'solid' ? ' is-active' : ''}" data-style="solid">実線</button>
        <button class="chip-btn${e.style === 'dashed' ? ' is-active' : ''}" data-style="dashed">破線</button>
        <button class="chip-btn${e.style === 'dotted' ? ' is-active' : ''}" data-style="dotted">点線</button>
      </div>
    </div>
    <div class="insp-section">
      <h3>配線</h3>
      <div class="btn-row" id="e-route">
        <button class="chip-btn${e.route !== 'orthogonal' ? ' is-active' : ''}" data-route="curved">〰 なめらか</button>
        <button class="chip-btn${e.route === 'orthogonal' ? ' is-active' : ''}" data-route="orthogonal">⌐ 直角</button>
      </div>
    </div>
    <div class="insp-section">
      <h3>色</h3>
      <div class="btn-row" style="margin-bottom:8px"><button class="chip-btn${!e.color ? ' is-active' : ''}" data-color="">既定</button></div>
      ${swatchRow(e.color)}
    </div>
    <div class="insp-section">
      <h3>操作</h3>
      <div class="btn-row"><button class="chip-btn danger" data-op="del">🗑 削除</button></div>
    </div>`;

  const lab = $('#e-label', inspBody);
  lab.addEventListener('input', () => editor.applyPatch({ label: lab.value }, false));
  lab.addEventListener('change', () => editor.commit());
  $('#e-dir', inspBody).addEventListener('click', (ev) => { const btn = ev.target.closest('[data-dir]'); if (btn) { editor.applyPatch({ dir: btn.dataset.dir }); setActive('#e-dir', btn); } });
  $('#e-style', inspBody).addEventListener('click', (ev) => { const btn = ev.target.closest('[data-style]'); if (btn) { editor.applyPatch({ style: btn.dataset.style }); setActive('#e-style', btn); } });
  $('#e-route', inspBody).addEventListener('click', (ev) => { const btn = ev.target.closest('[data-route]'); if (btn) { editor.applyPatch({ route: btn.dataset.route }); setActive('#e-route', btn); } });
  inspBody.querySelectorAll('[data-color]').forEach((s) => s.addEventListener('click', () => {
    editor.applyPatch({ color: s.dataset.color });
    inspBody.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('is-active', x === s));
  }));
  bindOps();
}

function setActive(sel, btn) { $(sel, inspBody).querySelectorAll('.chip-btn').forEach((b) => b.classList.toggle('is-active', b === btn)); }
function bindOps() {
  inspBody.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.op === 'del') editor.deleteSelected();
    else if (b.dataset.op === 'dup') editor.duplicateSelected();
  }));
}

/* ---------------- keyboard ---------------- */
let clip = null, pasteN = 0;   // copy/paste buffer
addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  const meta = e.ctrlKey || e.metaKey;
  if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return; }
  if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); return; }
  if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); return; }
  if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); editor.duplicateSelected(); return; }
  if (meta && e.key.toLowerCase() === 'c') { const n = editor.selected(); if (editor.sel.kind === 'node' && n) { e.preventDefault(); clip = { type: n.type, label: n.label, sub: n.sub, color: n.color }; pasteN = 0; toast('コピーしました'); } return; }
  if (meta && e.key.toLowerCase() === 'v') { if (clip) { e.preventDefault(); const r = svg.getBoundingClientRect(); const w = editor.screenToWorld(r.left + r.width / 2, r.top + r.height / 2); const o = (++pasteN) * 18; editor.addNode(clip.type, w.x + o, w.y + o, { label: clip.label, sub: clip.sub, color: clip.color }); } return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editor.deleteSelected(); return; }
  if (e.key === 'f' || e.key === 'F') { editor.fitView(); return; }
  if (e.key === 'Escape') { editor.select(null, null); return; }
});
function isTyping(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }

/* ---------------- save / load ---------------- */
function saveFile() {
  if (!Object.keys(editor.state.nodes).length) { toast('図が空です', 'err'); return; }
  const blob = new Blob([JSON.stringify(editor.toJSON(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sysarch-diagram.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('JSON を保存しました', 'ok');
}
$('#file-input').addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { try { editor.loadJSON(JSON.parse(reader.result)); toast('読み込みました', 'ok'); } catch (err) { toast('読み込み失敗: ' + err.message, 'err'); } };
  reader.readAsText(file);
  e.target.value = '';
});

/* ---------------- empty hint / demo ---------------- */
const emptyHint = $('#empty-hint');
document.querySelector('.stage').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'demo') { editor.loadJSON(demoDiagram()); toast('デモを読み込みました', 'ok'); }
  if (b.dataset.act === 'dismiss-hint') emptyHint.classList.add('hidden');
});
editor.on('change', () => {
  const empty = !Object.keys(editor.state.nodes).length;
  emptyHint.classList.toggle('hidden', !empty);
  updateMinimap();
});
editor.on('view', () => { $('#zoom-label').textContent = Math.round(editor.view.k * 100) + '%'; updateMmView(); });

/* ---------------- minimap ---------------- */
const mmSvg = $('#minimap-svg');
mmSvg.setAttribute('preserveAspectRatio', 'none');
const mmView = $('#mm-view');
let mmBox = null;
function updateMinimap() {
  const nodes = Object.values(editor.state.nodes);
  if (!nodes.length) { mmSvg.innerHTML = ''; mmView.style.display = 'none'; return; }
  const b = editor.contentBBox(80); mmBox = b;
  mmSvg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  mmSvg.innerHTML = nodes.map((n) =>
    `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" fill="${n.color}" opacity="0.85"/>`).join('');
  updateMmView();
}
function updateMmView() {
  if (!mmBox) return;
  const r = svg.getBoundingClientRect();
  const tl = editor.screenToWorld(r.left, r.top);
  const br = editor.screenToWorld(r.left + r.width, r.top + r.height);
  const mm = $('#minimap').getBoundingClientRect();
  const sx = mm.width / mmBox.w, sy = mm.height / mmBox.h;
  const x = (tl.x - mmBox.x) * sx, y = (tl.y - mmBox.y) * sy;
  const w = (br.x - tl.x) * sx, h = (br.y - tl.y) * sy;
  mmView.style.display = '';
  mmView.style.left = x + 'px'; mmView.style.top = y + 'px';
  mmView.style.width = w + 'px'; mmView.style.height = h + 'px';
}
$('#minimap').addEventListener('pointerdown', (e) => {
  if (!mmBox) return;
  const mm = $('#minimap').getBoundingClientRect();
  const wx = mmBox.x + (e.clientX - mm.left) / mm.width * mmBox.w;
  const wy = mmBox.y + (e.clientY - mm.top) / mm.height * mmBox.h;
  const r = svg.getBoundingClientRect();
  editor.view.tx = r.width / 2 - wx * editor.view.k;
  editor.view.ty = r.height / 2 - wy * editor.view.k;
  editor._applyView();
});
addEventListener('resize', updateMmView);

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast ' + kind; }, 2200);
}

/* ---------------- demo diagram ---------------- */
function demoDiagram() {
  const N = (id, type, x, y, label, sub) => ({ id, type, x, y, w: 188, h: 64, label, sub, color: typeInfo(type).color, shape: 'card' });
  const nodes = [
    N('n1', 'user', 40, 240, 'エンドユーザー', 'ブラウザ / モバイル'),
    N('n2', 'cdn', 320, 96, 'CDN', 'CloudFront'),
    N('n3', 'gateway', 320, 384, 'APIゲートウェイ', 'REST / 認証'),
    N('n4', 'web', 600, 96, 'Webサーバ', 'Nginx'),
    N('n5', 'service', 600, 384, 'アプリケーション', 'Node.js / Container'),
    N('n6', 'auth', 600, 560, '認証 IdP', 'OAuth2 / OIDC'),
    N('n7', 'db', 900, 40, 'RDB', 'PostgreSQL (Primary)'),
    N('n8', 'cache', 900, 216, 'キャッシュ', 'Redis'),
    N('n9', 'queue', 900, 392, 'メッセージキュー', 'SQS'),
    N('n10', 'function', 1180, 392, 'ワーカー', 'Lambda'),
    N('n11', 'storage', 900, 560, 'オブジェクトストレージ', 'S3'),
    N('n12', 'monitor', 1180, 216, '監視', 'CloudWatch / Datadog'),
  ];
  let ec = 0;
  const E = (from, to, label, style = 'solid', dir = 'forward') => ({ id: 'e' + (++ec), from, to, label, style, dir, color: '' });
  const edges = [
    E('n1', 'n2', 'HTTPS'),
    E('n1', 'n3', 'HTTPS'),
    E('n2', 'n4', 'assets'),
    E('n3', 'n5', 'REST'),
    E('n4', 'n5', 'API'),
    E('n5', 'n6', 'OIDC', 'dashed'),
    E('n5', 'n7', 'SQL'),
    E('n5', 'n8', 'read/write'),
    E('n5', 'n9', 'publish', 'dashed'),
    E('n9', 'n10', 'consume', 'dashed'),
    E('n10', 'n11', 'put', 'dashed'),
    E('n5', 'n12', 'metrics', 'dotted', 'forward'),
  ];
  const state = { nodes: {}, edges: {}, order: [], counter: 100 };
  nodes.forEach((n) => { state.nodes[n.id] = n; state.order.push(n.id); });
  edges.forEach((e) => { state.edges[e.id] = e; });
  return { version: 1, state };
}

// integration / collaboration diagram sample (departments × SaaS × process boxes)
function demoIntegration() {
  let i = 200; const nid = () => 'n' + (++i);
  const back = [], front = [];
  const zone = (x, y, w, h, label, c) => { const o = { id: nid(), type: 'zone', x, y, w, h, label, sub: '', color: c, shape: 'group' }; back.push(o); return o; };
  const band = (x, y, w, h, label, c) => { const o = { id: nid(), type: 'band', x, y, w, h, label, sub: '', color: c, shape: 'band' }; back.push(o); return o; };
  const banner = (x, y, w, label, c) => { const o = { id: nid(), type: 'banner', x, y, w, h: 52, label, sub: '', color: c, shape: 'banner' }; front.push(o); return o; };
  const box = (x, y, label) => { const o = { id: nid(), type: 'step', x, y, w: 120, h: 44, label, sub: '', color: '#94a3b8', shape: 'plain' }; front.push(o); return o; };
  const logo = (x, y, type, label, c) => { const o = { id: nid(), type, x, y, w: 172, h: 56, label, sub: '', color: c, shape: 'card' }; front.push(o); return o; };

  banner(40, 22, 320, '全社DX システム連携図', '#4d8dff');
  band(30, 300, 700, 258, 'Salesforce 基盤', '#4dd0e1');
  zone(40, 96, 300, 196, 'マーケティング部門', '#5b9dff');
  zone(380, 96, 330, 462, 'セールス部門', '#7c5cff');
  zone(752, 118, 210, 306, 'バックオフィス', '#43d19e');
  zone(984, 118, 250, 306, 'カスタマーサクセス', '#ffb454');

  logo(60, 150, 'google', 'Google 広告', '#4285F4');
  const mLead = box(70, 226, 'リード');
  const mNur = box(210, 226, 'リード育成');

  logo(398, 150, 'zoom', 'Zoom / Meet', '#2D8CFF');
  logo(560, 150, 'salesforce', 'Salesforce', '#00A1E0');
  const bTori = box(398, 330, '取引先');
  const bTanto = box(398, 392, '取引先責任者');
  const bSho = box(560, 330, '商談');
  const bAct = box(560, 392, '活動履歴');
  const bMi = box(560, 454, '見積り');
  const bKe = box(560, 508, '契約');

  logo(760, 150, 'freee', 'freee 会計', '#007BE0');
  const oSei = box(778, 240, '請求・売上');
  const oShin = box(778, 302, '申請');
  const oJu = box(778, 364, '受注承認');

  logo(1000, 40, 'slack', 'Slack', '#611f69');
  const cAnken = box(1006, 240, '案件');
  const cChohyo = box(1006, 302, '帳票出力');
  const cKosu = box(1006, 364, '工数管理');

  const edges = []; let e = 0;
  const E = (from, to, label = '', style = 'solid', dir = 'forward') => edges.push({ id: 'e' + (++e), from: from.id, to: to.id, label, style, dir, route: 'orthogonal', color: '' });
  E(mLead, mNur, '育成'); E(mNur, bTori, '引き渡し');
  E(bTori, bSho); E(bTanto, bSho); E(bSho, bAct); E(bAct, bMi); E(bMi, bKe);
  E(bKe, oSei, '受注', 'dashed'); E(oSei, oShin); E(oShin, oJu);
  E(oJu, cAnken, '案件化', 'dashed'); E(cAnken, cChohyo); E(cChohyo, cKosu);
  E(bSho, cAnken, '通知', 'dotted');

  const order = [...back.map((o) => o.id), ...front.map((o) => o.id)];
  const state = { nodes: {}, edges: {}, order, counter: 400 };
  [...back, ...front].forEach((o) => (state.nodes[o.id] = o));
  edges.forEach((x) => (state.edges[x.id] = x));
  return { version: 1, state };
}

/* ---------------- boot ---------------- */
if (!editor.loadAutosave()) {
  editor.loadJSON(demoDiagram());
} else {
  editor.fitView();
}
editor.select(null, null);
