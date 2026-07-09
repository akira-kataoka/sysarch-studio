// App wiring: palette, toolbar, inspector, keyboard, minimap, demo, export.
import { initBackground } from './background.js';
import { Editor } from './editor.js';
import { GROUPS, TYPE_MAP, PALETTE_COLORS, typeInfo } from './nodes.js';
import { iconSvg } from './icons.js';
import { exportSVG, exportPNG, copyPNG } from './export.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = $('#canvas');
const editor = new Editor(svg);
window.__editor = editor; // debug / tooling handle

/* ---------------- theme + background ---------------- */
let bg = { setTheme() {} };
const savedTheme = localStorage.getItem('sysarch:theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;
initBackground().then((b) => { bg = b; bg.setTheme(currentTheme()); });
function currentTheme() { return document.documentElement.dataset.theme || 'dark'; }

/* ---------------- palette ---------------- */
function buildPalette() {
  const body = $('#palette-body');
  body.innerHTML = GROUPS.map((g) => `
    <div class="pal-group" data-group="${g.id}">
      <div class="pal-group-title" style="--gcolor:${g.color}">${g.title}</div>
      <div class="pal-items">
        ${g.types.map((t) => `
          <div class="pal-item" draggable="true" data-type="${t.id}" style="--ncolor:${t.color}" title="${t.label}">
            <div class="pi-icon">${iconSvg(t.icon, 18)}</div>
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
    case 'theme': toggleTheme(); break;
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
    else if (kind === 'clipboard') { await copyPNG(editor, 2); toast('PNG をクリップボードにコピー', 'ok'); }
  } catch (err) { console.error(err); toast('書き出しに失敗: ' + err.message, 'err'); }
});

function toggleExportMenu() {
  const m = $('#export-menu');
  m.hidden = !m.hidden;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-wrap')) $('#export-menu').hidden = true;
});

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('sysarch:theme', next);
  editor.render();      // recolor SVG content for the new theme
  bg.setTheme(next);
}

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
addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  const meta = e.ctrlKey || e.metaKey;
  if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return; }
  if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); return; }
  if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); return; }
  if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); editor.duplicateSelected(); return; }
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

/* ---------------- boot ---------------- */
if (!editor.loadAutosave()) {
  editor.loadJSON(demoDiagram());
} else {
  editor.fitView();
}
editor.select(null, null);
