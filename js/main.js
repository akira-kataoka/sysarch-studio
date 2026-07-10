// App wiring: palette, toolbar, inspector, keyboard, minimap, demo, export.
import { initBackground } from './background.js?v=24';
import { Editor } from './editor.js?v=24';
import { GROUPS, TYPE_MAP, PALETTE_COLORS, typeInfo } from './nodes.js?v=24';
import { iconSvg } from './icons.js?v=24';
import { BRAND_ICONS } from './brands.js?v=24';
import { exportSVG, exportPNG, copyPNG, exportPDF } from './export.js?v=24';

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

// pick an image file → data URI (raster downscaled to 128px; SVG kept as-is). Self-contained, export-safe.
function pickImage(cb) {
  const inp = $('#img-input');
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; inp.value = '';
    if (!f) return;
    const reader = new FileReader();
    if (f.type === 'image/svg+xml') { reader.onload = () => cb(reader.result); reader.readAsDataURL(f); return; }
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 128, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        try { cb(c.toDataURL('image/png')); } catch { cb(reader.result); }
      };
      img.onerror = () => cb(reader.result);
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  };
  inp.click();
}

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
let collapsedSet;
try { const s = JSON.parse(localStorage.getItem('sysarch:palcollapse')); collapsedSet = new Set(Array.isArray(s) ? s : ['brand']); } catch { collapsedSet = new Set(['brand']); }
let recent;
try { const s = JSON.parse(localStorage.getItem('sysarch:recent')); recent = Array.isArray(s) ? s.filter((id) => TYPE_MAP[id]) : []; } catch { recent = []; }

function renderPalItem(t) {
  const icon = t.upload
    ? `<div class="pi-icon pi-logo" style="background:${t.color};color:#fff;border-color:${t.color};font-size:18px">＋</div>`
    : t.logo
      ? (BRAND_ICONS[t.id]
          ? `<div class="pi-icon pi-logo" style="background:${BRAND_ICONS[t.id].hex};border-color:${BRAND_ICONS[t.id].hex}"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="${BRAND_ICONS[t.id].path}"/></svg></div>`
          : `<div class="pi-icon pi-logo" style="background:${t.color};color:#fff;border-color:${t.color}">${palInitials(t.label)}</div>`)
      : `<div class="pi-icon">${iconSvg(t.icon, 18)}</div>`;
  return `<div class="pal-item" draggable="true" data-type="${t.id}" style="--ncolor:${t.color}" title="${t.label}">${icon}<div class="pi-label">${t.label}</div></div>`;
}

function buildPalette() {
  const body = $('#palette-body');
  body.innerHTML = GROUPS.map((g) => `
    <div class="pal-group${collapsedSet.has(g.id) ? ' collapsed' : ''}" data-group="${g.id}">
      <div class="pal-group-title" style="--gcolor:${g.color}"><span class="pg-name">${g.title}</span><span class="pg-count">${g.types.length}</span><span class="pg-chev">▾</span></div>
      <div class="pal-items">${g.types.map(renderPalItem).join('')}</div>
    </div>`).join('');
  // collapse / expand a group by clicking its header
  body.querySelectorAll('.pal-group-title').forEach((t) => t.addEventListener('click', () => {
    const grp = t.closest('.pal-group'); const id = grp.dataset.group;
    grp.classList.toggle('collapsed');
    if (collapsedSet.has(id)) collapsedSet.delete(id); else collapsedSet.add(id);
    try { localStorage.setItem('sysarch:palcollapse', JSON.stringify([...collapsedSet])); } catch {}
  }));
}

function renderRecent() {
  const box = $('#pal-recent');
  const items = recent.map((id) => TYPE_MAP[id]).filter(Boolean).slice(0, 8);
  if (!items.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = '';
  box.innerHTML = `<div class="pal-group"><div class="pal-group-title pg-static" style="--gcolor:#4d8dff"><span class="pg-name">最近使った</span></div><div class="pal-items">${items.map(renderPalItem).join('')}</div></div>`;
}

function pushRecent(type) {
  if (!TYPE_MAP[type]) return;
  recent = [type, ...recent.filter((x) => x !== type)].slice(0, 8);
  try { localStorage.setItem('sysarch:recent', JSON.stringify(recent)); } catch {}
  renderRecent();
}

// place a part at the canvas center (upload types pick an image first)
function placeType(type) {
  const info = TYPE_MAP[type]; if (!info) return;
  const r = svg.getBoundingClientRect();
  const w = editor.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
  if (info.upload) { pickImage((uri) => { editor.addNode(type, w.x, w.y, { img: uri, label: 'サービス' }); toast('画像を配置しました'); pushRecent(type); }); return; }
  editor.addNode(type, w.x, w.y);
  toast(`「${typeInfo(type).label}」を追加`);
  pushRecent(type);
}

buildPalette();
renderRecent();

// delegated interactions (covers both group items and the recent row)
$('#palette').addEventListener('click', (e) => { const it = e.target.closest('.pal-item'); if (it) placeType(it.dataset.type); });
$('#palette').addEventListener('dragstart', (e) => {
  const it = e.target.closest('.pal-item'); if (!it) return;
  e.dataTransfer.setData('text/type', it.dataset.type);
  e.dataTransfer.setData('text/plain', it.dataset.type);
  e.dataTransfer.effectAllowed = 'copy';
});

$('#palette-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  $('#pal-recent').style.display = q ? 'none' : (recent.length ? '' : 'none');
  document.querySelectorAll('#palette-body .pal-group').forEach((grp) => {
    let visible = 0;
    grp.querySelectorAll('.pal-item').forEach((it) => {
      const hit = !q || TYPE_MAP[it.dataset.type].label.toLowerCase().includes(q) || it.dataset.type.includes(q);
      it.style.display = hit ? '' : 'none';
      if (hit) visible++;
    });
    grp.style.display = visible ? '' : 'none';
    if (q) grp.classList.remove('collapsed');                                  // expand while searching
    else grp.classList.toggle('collapsed', collapsedSet.has(grp.dataset.group)); // restore persisted state
  });
});

// drag & drop onto canvas
svg.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
svg.addEventListener('drop', (e) => {
  e.preventDefault();
  const type = e.dataTransfer.getData('text/type') || e.dataTransfer.getData('text/plain');
  if (!type || !TYPE_MAP[type]) return;
  const w = editor.screenToWorld(e.clientX, e.clientY);
  if (TYPE_MAP[type].upload) { pickImage((uri) => { editor.addNode(type, w.x, w.y, { img: uri, label: 'サービス' }); pushRecent(type); }); return; }
  editor.addNode(type, w.x, w.y);
  pushRecent(type);
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
    case 'grid': { const on = editor.toggleGrid(); btn.classList.toggle('is-on', on); document.querySelectorAll('[data-act="grid"]').forEach((g) => g.classList.toggle('is-on', on)); closeMenus(); break; }
    case 'layout': editor.autoLayout(); toast('自動整列しました'); closeMenus(); break;
    case 'samples': { const m = $('#samples-menu'); m.hidden = !m.hidden; $('#theme-menu').hidden = true; $('#export-menu').hidden = true; $('#more-menu') && ($('#more-menu').hidden = true); break; }
    case 'theme-menu': { const m = $('#theme-menu'); m.hidden = !m.hidden; $('#export-menu').hidden = true; $('#samples-menu').hidden = true; $('#more-menu') && ($('#more-menu').hidden = true); break; }
    case 'more': { const m = $('#more-menu'); m.hidden = !m.hidden; $('#theme-menu').hidden = true; $('#export-menu').hidden = true; $('#samples-menu').hidden = true; break; }
    case 'save': saveFile(); closeMenus(); break;
    case 'load': $('#file-input').click(); closeMenus(); break;
    case 'export': toggleExportMenu(); break;
    case 'help': openHelp(); break;
  }
});

/* ---------------- help overlay ---------------- */
const helpOverlay = $('#help-overlay');
function openHelp() { helpOverlay.hidden = false; }
function closeHelp() { helpOverlay.hidden = true; }
helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay || e.target.closest('[data-act="help-close"]')) closeHelp(); });
// show the guide once on first visit
if (!localStorage.getItem('sysarch:seenhelp')) { try { localStorage.setItem('sysarch:seenhelp', '1'); } catch {} setTimeout(openHelp, 800); }
function closeMenus() { ['#export-menu', '#theme-menu', '#samples-menu', '#more-menu'].forEach((s) => { const m = $(s); if (m) m.hidden = true; }); }

const PAD_PRESETS = [{ v: 0, l: 'なし' }, { v: 24, l: '小' }, { v: 48, l: '標準' }, { v: 96, l: '大' }];
const exportOpts = { background: true, selectionOnly: false, pad: 48 };
function refreshExportOpts() {
  const bt = $('#exopt-bg'); if (bt) bt.classList.toggle('is-checked', exportOpts.background);
  const st = $('#exopt-sel'); if (st) st.classList.toggle('is-checked', exportOpts.selectionOnly);
  const pt = $('#exopt-pad'); if (pt) { const cur = PAD_PRESETS.find((p) => p.v === exportOpts.pad) || PAD_PRESETS[2]; pt.innerHTML = `余白: ${cur.l} <em>クリックで なし/小/標準/大</em>`; }
}
refreshExportOpts();

$('#export-menu').addEventListener('click', async (e) => {
  const opt = e.target.closest('[data-exopt]');
  if (opt) {                                                                    // toggle/cycle option, keep menu open
    if (opt.dataset.exopt === 'bg') exportOpts.background = !exportOpts.background;
    else if (opt.dataset.exopt === 'sel') exportOpts.selectionOnly = !exportOpts.selectionOnly;
    else if (opt.dataset.exopt === 'pad') { const i = PAD_PRESETS.findIndex((p) => p.v === exportOpts.pad); exportOpts.pad = PAD_PRESETS[(i + 1) % PAD_PRESETS.length].v; }
    refreshExportOpts(); return;
  }
  const b = e.target.closest('[data-export]'); if (!b) return;
  const kind = b.dataset.export;
  $('#export-menu').hidden = true;
  if (!Object.keys(editor.state.nodes).length) { toast('図が空です', 'err'); return; }
  if (exportOpts.selectionOnly && !editor.selNodes.size) { toast('ノードを選択してください（選択範囲のみが有効）', 'err'); return; }
  const only = (exportOpts.selectionOnly && editor.selNodes.size) ? editor.selNodes : null;
  const o = { background: exportOpts.background, only, pad: exportOpts.pad };
  try {
    if (kind === 'svg') { exportSVG(editor, o); toast('SVG を書き出しました', 'ok'); }
    else if (kind === 'png') { await exportPNG(editor, 2, o); toast('PNG (2x) を書き出しました', 'ok'); }
    else if (kind === 'png4') { await exportPNG(editor, 4, o); toast('PNG (4x) を書き出しました', 'ok'); }
    else if (kind === 'pdf') { await exportPDF(editor, 2, o); toast('PDF を書き出しました（背景あり）', 'ok'); }
    else if (kind === 'clipboard') { await copyPNG(editor, 2, o); toast('PNG をクリップボードにコピー', 'ok'); }
  } catch (err) { console.error(err); toast('書き出しに失敗: ' + err.message, 'err'); }
});

function toggleExportMenu() {
  const m = $('#export-menu');
  m.hidden = !m.hidden;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-wrap')) closeMenus();
});

$('#samples-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sample]'); if (!b) return;
  closeMenus();
  const map = { arch: demoDiagram, microservices: demoMicroservices, serverless: demoServerless, ecommerce: demoEcommerce, hybrid: demoHybrid, dataplatform: demoDataPlatform, integration: demoIntegration, hr: demoHRIntegration };
  editor.loadJSON((map[b.dataset.sample] || demoDiagram)());
  toast('サンプルを読み込みました', 'ok');
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
  if (editor.selNodes && editor.selNodes.size >= 2) { renderMultiInspector(); return; }
  if (!sel || !sel.kind) { inspEmpty.hidden = false; inspBody.hidden = true; inspBody.innerHTML = ''; return; }
  inspEmpty.hidden = true; inspBody.hidden = false;
  if (sel.kind === 'node') renderNodeInspector(editor.state.nodes[sel.id]);
  else renderEdgeInspector(editor.state.edges[sel.id]);
}

function renderMultiInspector() {
  inspEmpty.hidden = true; inspBody.hidden = false;
  inspBody.innerHTML = `
    <div class="insp-section">
      <h3>複数選択 (${editor.selNodes.size})</h3>
      <div class="field" style="font-size:11.5px;color:var(--text-faint)">Shift+クリックで増減 / Shift+ドラッグで範囲選択</div>
    </div>
    <div class="insp-section">
      <h3>整列</h3>
      <div class="btn-row" id="m-align">
        <button class="chip-btn" data-al="left" title="左揃え">⇤ 左</button>
        <button class="chip-btn" data-al="hcenter" title="左右中央">↔ 中央</button>
        <button class="chip-btn" data-al="right" title="右揃え">⇥ 右</button>
      </div>
      <div class="btn-row" id="m-align2" style="margin-top:7px">
        <button class="chip-btn" data-al="top" title="上揃え">⤒ 上</button>
        <button class="chip-btn" data-al="vcenter" title="上下中央">↕ 中央</button>
        <button class="chip-btn" data-al="bottom" title="下揃え">⤓ 下</button>
      </div>
    </div>
    <div class="insp-section">
      <h3>等間隔に分布</h3>
      <div class="btn-row" id="m-dist">
        <button class="chip-btn" data-di="h">水平</button>
        <button class="chip-btn" data-di="v">垂直</button>
      </div>
    </div>
    <div class="insp-section">
      <h3>操作</h3>
      <div class="btn-row"><button class="chip-btn danger" data-mop="del">🗑 まとめて削除</button></div>
    </div>`;
  inspBody.querySelectorAll('[data-al]').forEach((b) => b.addEventListener('click', () => editor.alignSelected(b.dataset.al)));
  inspBody.querySelectorAll('[data-di]').forEach((b) => b.addEventListener('click', () => editor.distributeSelected(b.dataset.di)));
  inspBody.querySelector('[data-mop="del"]').addEventListener('click', () => editor.deleteSelected());
}

function swatchRow(active) {
  return `<div class="swatches">${PALETTE_COLORS.map((c) =>
    `<div class="swatch${c === active ? ' is-active' : ''}" style="background:${c}" data-color="${c}"></div>`).join('')}</div>`;
}

function renderNodeInspector(n) {
  if (!n) return;
  const info = typeInfo(n.type);
  const isText = n.shape === 'text';
  const isList = n.shape === 'list';
  const isGroup = n.shape === 'group';
  const isLogo = info.logo || n.img;
  const labelField = isText
    ? `<textarea id="f-label" rows="2" placeholder="テキスト（改行可）">${esc(n.label)}</textarea>`
    : `<input id="f-label" type="text" value="${esc(n.label)}" />`;
  const subField = isText ? '' : (isList
    ? `<div class="field"><label>項目（1行に1つ）</label><textarea id="f-sub" rows="5" placeholder="社内共有&#10;顧客フォルダ&#10;外部共有フォルダ">${esc(n.sub)}</textarea></div>`
    : `<div class="field"><label>補足（サブテキスト）</label><input id="f-sub" type="text" value="${esc(n.sub)}" placeholder="例: Nginx / t3.medium" /></div>`);
  inspBody.innerHTML = `
    <div class="insp-section">
      <h3>${info.groupTitle || 'ノード'} · ${info.label}</h3>
      <div class="field"><label>${isList ? 'タイトル' : 'ラベル'}</label>${labelField}</div>
      ${subField}
      <div class="field"><label>種別</label><select id="f-type">
        ${GROUPS.map((g) => `<optgroup label="${g.title}">${g.types.map((t) =>
          `<option value="${t.id}"${t.id === n.type ? ' selected' : ''}>${t.label}</option>`).join('')}</optgroup>`).join('')}
      </select></div>
      ${isLogo ? `<div class="field"><label>ロゴ画像</label><div class="btn-row">
        <button class="chip-btn" data-op="img">🖼 画像を選択</button>
        ${n.img ? '<button class="chip-btn" data-op="img-clear">画像を消す</button>' : ''}
      </div></div>
      <div class="field"><label>表示</label><div class="btn-row">
        <button class="chip-btn${n.compact ? ' is-active' : ''}" data-op="compact">▪ コンパクト（アイコンのみ）</button>
      </div></div>` : ''}
    </div>
    <div class="insp-section">
      <h3>アクセント色</h3>
      ${swatchRow(n.color)}
    </div>
    ${isGroup ? `<div class="insp-section"><h3>コンテナ</h3><div class="btn-row">
        <button class="chip-btn" data-op="arrangezone">▦ 中身をグリッド整列</button>
        <button class="chip-btn" data-op="fitzone">▣ 中身に合わせる</button>
      </div></div>` : ''}
    <div class="insp-section">
      <h3>重なり順</h3>
      <div class="btn-row">
        <button class="chip-btn" data-op="front">⬆ 前面へ</button>
        <button class="chip-btn" data-op="back">⬇ 背面へ</button>
      </div>
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
  if (sub) { sub.addEventListener('input', () => editor.applyPatch({ sub: sub.value }, false)); sub.addEventListener('change', () => editor.commit()); }
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
      <h3>経由点（ベンド）</h3>
      <div class="field" style="font-size:11px;color:var(--text-faint)">線上の＋点をドラッグで曲げる / 点をダブルクリックで削除。線を選んでラベルをドラッグで位置調整</div>
      <div class="btn-row">
        <button class="chip-btn" data-eop="clearpts"${(e.points && e.points.length) ? '' : ' disabled'}>経由点をクリア${(e.points && e.points.length) ? `（${e.points.length}）` : ''}</button>
        <button class="chip-btn" data-eop="labelreset"${(e.lx || e.ly) ? '' : ' disabled'}>ラベル位置をリセット</button>
      </div>
    </div>
    <div class="insp-section">
      <h3>操作</h3>
      <div class="btn-row"><button class="chip-btn danger" data-op="del">🗑 削除</button></div>
    </div>`;

  inspBody.querySelectorAll('[data-eop]').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.hasAttribute('disabled')) return;
    if (btn.dataset.eop === 'clearpts') editor.applyPatch({ points: [] });
    else if (btn.dataset.eop === 'labelreset') editor.applyPatch({ lx: 0, ly: 0 });
    editor.emit('select', editor.sel);
  }));
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
    else if (b.dataset.op === 'img') pickImage((uri) => { editor.applyPatch({ img: uri }); editor.emit('select', editor.sel); });
    else if (b.dataset.op === 'img-clear') { editor.applyPatch({ img: '' }); editor.emit('select', editor.sel); }
    else if (b.dataset.op === 'front') editor.bringToFront();
    else if (b.dataset.op === 'back') editor.sendToBack();
    else if (b.dataset.op === 'fitzone') { editor.fitZoneToChildren(); toast('枠を中身に合わせました'); }
    else if (b.dataset.op === 'arrangezone') { editor.arrangeZone(); toast('中身をグリッド整列しました'); }
    else if (b.dataset.op === 'compact') { const n = editor.selected(); const c = !n.compact; editor.applyPatch({ compact: c, w: c ? 76 : 170, h: c ? 82 : 56 }); editor.emit('select', editor.sel); }
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
  if (e.key === '?') { openHelp(); return; }
  if (e.key === 'f' || e.key === 'F') { editor.fitView(); return; }
  if (e.key === 'Escape') { if (!helpOverlay.hidden) { closeHelp(); return; } editor.select(null, null); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    if (editor.sel.kind === 'node') {
      e.preventDefault();
      const s = e.shiftKey ? 1 : 8;
      editor.nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
    }
    return;
  }
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

// integration / assembly diagram sample — showcases zones, bands, real logos,
// shared builder for sample diagrams
function demoBuilder() {
  let i = 100; const nid = () => 'n' + (++i);
  const back = [], front = [], edges = []; let e = 0;
  return {
    zone: (x, y, w, h, label, c) => { const o = { id: nid(), type: 'zone', x, y, w, h, label, sub: '', color: c, shape: 'group' }; back.push(o); return o; },
    band: (x, y, w, h, label, c) => { const o = { id: nid(), type: 'band', x, y, w, h, label, sub: '', color: c, shape: 'band' }; back.push(o); return o; },
    banner: (x, y, w, label, c = '#4d8dff') => { const o = { id: nid(), type: 'banner', x, y, w, h: 52, label, sub: '', color: c, shape: 'banner' }; front.push(o); return o; },
    node: (type, x, y, label, sub = '') => { const b = typeInfo(type); const o = { id: nid(), type, x, y, w: 188, h: 64, label: label ?? b.label, sub, color: b.color, shape: b.shape || 'card' }; front.push(o); return o; },
    logo: (type, x, y, label) => { const b = typeInfo(type); const o = { id: nid(), type, x, y, w: 170, h: 56, label: label ?? b.label, sub: '', color: b.color, shape: 'card' }; front.push(o); return o; },
    box: (x, y, label, w = 120) => { const o = { id: nid(), type: 'step', x, y, w, h: 44, label, sub: '', color: '#94a3b8', shape: 'plain' }; front.push(o); return o; },
    list: (x, y, label, items, c = '#5b9dff') => { const o = { id: nid(), type: 'list', x, y, w: 180, h: 120, label, sub: items.join('\n'), color: c, shape: 'list' }; front.push(o); return o; },
    txt: (x, y, label) => { const o = { id: nid(), type: 'text', x, y, w: 120, h: 24, label, sub: '', color: '#94a3b8', shape: 'text' }; front.push(o); return o; },
    E: (from, to, label = '', style = 'solid', route = 'orthogonal', dir = 'forward') => { edges.push({ id: 'e' + (++e), from: from.id, to: to.id, label, style, dir, route, color: '' }); },
    finish: () => { const order = [...back.map((o) => o.id), ...front.map((o) => o.id)]; const state = { nodes: {}, edges: {}, order, counter: 1000 }; [...back, ...front].forEach((o) => (state.nodes[o.id] = o)); edges.forEach((x) => (state.edges[x.id] = x)); return { version: 1, state }; },
  };
}

// microservices architecture
function demoMicroservices() {
  const B = demoBuilder();
  B.banner(40, 20, 380, 'マイクロサービス アーキテクチャ');
  const cli = B.node('browser', 60, 150, 'クライアント', 'Web / モバイル');
  const gw = B.node('gateway', 320, 150, 'API Gateway', '認証 / ルーティング');
  const auth = B.logo('auth0', 336, 270, 'Auth0');
  B.zone(560, 90, 460, 440, 'マイクロサービス', '#7c5cff');
  const s1 = B.node('service', 580, 130, '注文サービス'); const d1 = B.node('db', 580, 224, '注文DB', 'PostgreSQL');
  const s2 = B.node('service', 800, 130, '在庫サービス'); const d2 = B.node('db', 800, 224, '在庫DB', 'PostgreSQL');
  const s3 = B.node('service', 580, 340, '決済サービス'); const d3 = B.node('db', 580, 434, '決済DB', 'PostgreSQL');
  const s4 = B.node('service', 800, 340, '通知サービス');
  const cache = B.node('cache', 1060, 130, 'キャッシュ', 'Redis');
  const mq = B.node('queue', 1060, 224, 'メッセージング', 'Kafka');
  const mon = B.logo('datadog', 1060, 330, 'Datadog');
  const graf = B.logo('grafana', 1060, 410, 'Grafana');
  B.E(cli, gw, 'HTTPS'); B.E(gw, auth, '検証', 'dashed');
  [s1, s2, s3, s4].forEach((s) => B.E(gw, s));
  B.E(s1, d1); B.E(s2, d2); B.E(s3, d3);
  B.E(s1, mq, 'publish', 'dashed'); B.E(s2, mq, '', 'dashed'); B.E(mq, s4, 'consume', 'dashed');
  B.E(s1, cache, '', 'dotted'); B.E(s2, cache, '', 'dotted'); B.E(s1, mon, 'metrics', 'dotted');
  return B.finish();
}

// serverless / managed-cloud architecture
function demoServerless() {
  const B = demoBuilder();
  B.banner(40, 20, 360, 'サーバーレス / クラウド構成');
  const cli = B.node('browser', 60, 170, 'ユーザー', 'ブラウザ');
  const cdn = B.logo('cloudflare', 300, 110, 'CDN');
  const gw = B.node('gateway', 300, 210, 'API Gateway');
  const auth = B.logo('auth0', 300, 330, 'Auth0');
  B.zone(560, 90, 440, 320, 'サーバーレス', '#43d19e');
  const f1 = B.node('function', 580, 130, '認証Fn'); const f2 = B.node('function', 790, 130, '注文Fn');
  const f3 = B.node('function', 580, 230, '画像処理Fn'); const f4 = B.node('function', 790, 230, '集計Fn');
  const q = B.node('queue', 580, 330, 'キュー', 'SQS');
  const db = B.node('nosql', 1040, 120, 'NoSQL', 'DynamoDB');
  const store = B.node('storage', 1040, 220, 'ストレージ', 'S3');
  const mon = B.logo('datadog', 1040, 330, '監視');
  B.E(cli, cdn); B.E(cdn, gw, 'assets'); B.E(cli, gw, 'HTTPS');
  B.E(gw, f1); B.E(gw, f2); B.E(f1, auth, '', 'dashed');
  B.E(f2, q, 'publish', 'dashed'); B.E(q, f4, 'consume', 'dashed');
  B.E(f2, db); B.E(f3, store); B.E(f4, db, '', 'dotted');
  return B.finish();
}

// data platform / analytics pipeline
function demoDataPlatform() {
  const B = demoBuilder();
  B.banner(40, 20, 360, 'データ基盤 / 分析パイプライン');
  B.zone(40, 90, 250, 320, 'データソース', '#5b9dff');
  const s1 = B.logo('salesforce', 56, 124, 'Salesforce'); const s2 = B.logo('googleanalytics', 56, 192, 'GA4');
  const s3 = B.logo('wordpress', 56, 260, 'WordPress'); const s4 = B.logo('stripe', 56, 328, 'Stripe');
  B.zone(320, 90, 220, 320, '収集 / ETL', '#ffb454');
  const ing = B.node('function', 336, 150, 'ETL', 'Airbyte'); const q = B.node('queue', 336, 260, 'ストリーム', 'Kafka');
  B.zone(570, 90, 240, 320, '蓄積', '#43d19e');
  const lake = B.node('storage', 586, 150, 'データレイク', 'S3'); const wh = B.logo('snowflake', 586, 260, 'Snowflake');
  B.zone(840, 90, 240, 320, '分析 / BI', '#c084fc');
  const bi1 = B.logo('tableau', 856, 150, 'Tableau'); const bi2 = B.logo('looker', 856, 260, 'Looker');
  [s1, s2, s3, s4].forEach((s) => B.E(s, ing));
  B.E(ing, q, '', 'dashed'); B.E(q, lake, '', 'dashed'); B.E(ing, lake); B.E(lake, wh, 'ロード'); B.E(wh, bi1); B.E(wh, bi2);
  return B.finish();
}

// e-commerce site architecture
function demoEcommerce() {
  const B = demoBuilder();
  B.banner(40, 20, 340, 'ECサイト システム構成');
  const cli = B.node('browser', 60, 190, '買い物客', 'Web / アプリ');
  const cdn = B.logo('cloudflare', 300, 130, 'CDN');
  const lb = B.node('lb', 300, 240, 'ロードバランサ');
  B.zone(560, 90, 460, 420, 'アプリケーション', '#7c5cff');
  const web = B.node('web', 580, 130, 'Webフロント', 'Next.js');
  const cart = B.node('service', 580, 230, 'カートサービス');
  const order = B.node('service', 580, 330, '注文サービス');
  const cat = B.node('service', 790, 130, 'カタログ');
  const pay = B.node('service', 790, 230, '決済サービス');
  const search = B.node('nosql', 790, 330, '検索', 'Elasticsearch');
  const db = B.node('db', 1060, 120, '商品DB', 'PostgreSQL');
  const cache = B.node('cache', 1060, 220, 'キャッシュ', 'Redis');
  const stripe = B.logo('stripe', 1060, 320, 'Stripe');
  const q = B.node('queue', 1060, 410, 'キュー', 'SQS');
  B.E(cli, cdn); B.E(cdn, lb, 'assets'); B.E(cli, lb, 'HTTPS');
  B.E(lb, web); B.E(web, cart); B.E(web, cat); B.E(cart, order); B.E(order, pay);
  B.E(pay, stripe, '決済', 'dashed'); B.E(cat, search); B.E(cat, db); B.E(order, db);
  B.E(cart, cache, '', 'dotted'); B.E(order, q, '通知', 'dashed');
  return B.finish();
}

// hybrid on-prem + cloud architecture
function demoHybrid() {
  const B = demoBuilder();
  B.banner(40, 20, 420, 'ハイブリッド構成（オンプレ ＋ クラウド）');
  B.zone(40, 110, 340, 380, 'オンプレミス', '#94a3b8');
  const legacy = B.node('app', 60, 150, '基幹システム', 'Oracle');
  const odb = B.node('db', 60, 250, '基幹DB', 'Oracle');
  const batch = B.node('batch', 60, 350, '夜間バッチ');
  const vpn = B.node('firewall', 410, 260, 'VPN / 専用線');
  B.zone(620, 110, 460, 380, 'クラウド', '#4dd0e1');
  const gw = B.node('gateway', 640, 150, 'API Gateway');
  const svc = B.node('service', 640, 250, '連携サービス');
  const dwh = B.logo('snowflake', 850, 150, 'DWH');
  const bi = B.logo('tableau', 850, 250, 'BI');
  const store = B.node('storage', 850, 360, 'ストレージ', 'S3');
  B.E(legacy, odb); B.E(batch, odb); B.E(legacy, vpn, '連携', 'dashed');
  B.E(vpn, svc, '', 'dashed'); B.E(svc, gw); B.E(odb, dwh, '日次連携', 'dotted');
  B.E(dwh, bi); B.E(svc, store);
  return B.finish();
}

// recruiting / HR integration diagram
function demoHRIntegration() {
  const B = demoBuilder();
  B.banner(40, 20, 340, '採用・人事 システム連携図');
  B.zone(40, 100, 300, 330, '採用領域', '#5b9dff');
  const m1 = B.logo('indeed', 56, 132, 'Indeed'); const m2 = B.logo('linkedin', 56, 200, 'LinkedIn'); const m3 = B.logo('wantedly', 56, 268, 'Wantedly');
  const apl = B.box(236, 150, '応募者'); const scr = B.box(236, 212, '選考');
  B.zone(370, 100, 300, 330, '人事 / ATS', '#7c5cff');
  const ats = B.logo('notion', 386, 132, 'ATS');
  const offer = B.box(556, 150, '内定'); const onb = B.box(556, 212, '入社手続'); const emp = B.box(556, 274, '従業員');
  B.zone(700, 100, 300, 330, '労務 / 情報共有', '#43d19e');
  const slack = B.logo('slack', 716, 132, 'Slack'); const cal = B.logo('googlecalendar', 716, 200, 'Calendar');
  const kintai = B.box(896, 150, '勤怠'); const kyuyo = B.box(896, 212, '給与'); const hoken = B.box(896, 274, '社会保険');
  [m1, m2, m3].forEach((m) => B.E(m, apl));
  B.E(apl, scr); B.E(scr, ats, '登録', 'dashed'); B.E(ats, offer); B.E(offer, onb); B.E(onb, emp);
  B.E(emp, kintai); B.E(kintai, kyuyo); B.E(kyuyo, hoken);
  B.E(onb, slack, '通知', 'dotted');
  return B.finish();
}

// integration / assembly diagram sample
function demoIntegration() {
  let i = 200; const nid = () => 'n' + (++i);
  const back = [], front = [];
  const zone = (x, y, w, h, label, c) => { const o = { id: nid(), type: 'zone', x, y, w, h, label, sub: '', color: c, shape: 'group' }; back.push(o); return o; };
  const band = (x, y, w, h, label, c) => { const o = { id: nid(), type: 'band', x, y, w, h, label, sub: '', color: c, shape: 'band' }; back.push(o); return o; };
  const banner = (x, y, w, label, c) => { const o = { id: nid(), type: 'banner', x, y, w, h: 52, label, sub: '', color: c, shape: 'banner' }; front.push(o); return o; };
  const box = (x, y, label, w = 120) => { const o = { id: nid(), type: 'step', x, y, w, h: 44, label, sub: '', color: '#94a3b8', shape: 'plain' }; front.push(o); return o; };
  const logo = (x, y, type, label) => { const b = typeInfo(type); const o = { id: nid(), type, x, y, w: 170, h: 56, label: label ?? b.label, sub: '', color: b.color, shape: 'card' }; front.push(o); return o; };
  const list = (x, y, label, items, c = '#4dd0e1') => { const o = { id: nid(), type: 'list', x, y, w: 178, h: 120, label, sub: items.join('\n'), color: c, shape: 'list' }; front.push(o); return o; };
  const txt = (x, y, label) => { const o = { id: nid(), type: 'text', x, y, w: 120, h: 24, label, sub: '', color: '#94a3b8', shape: 'text' }; front.push(o); return o; };

  banner(40, 18, 400, '全社DX システム連携・組立図', '#4d8dff');

  // ---- 共通領域 (comms / storage) ----
  zone(40, 96, 230, 452, '共通領域 / コミュニケーション', '#4dd0e1');
  logo(56, 132, 'slack', 'Slack');
  logo(56, 200, 'zoom', 'Zoom / Meet');
  logo(56, 268, 'box', 'Box');
  const boxList = list(56, 332, '共有フォルダ', ['社内共有', '顧客フォルダ', '外部共有フォルダ']);
  logo(56, 468, 'github', 'GitHub');

  // ---- マーケティング領域 ----
  zone(300, 96, 250, 250, 'マーケティング領域', '#5b9dff');
  logo(316, 132, 'googleanalytics', 'GA4');
  logo(316, 200, 'wordpress', 'WordPress');
  const mLead = box(316, 276, '問い合わせ');
  const mDoc = box(446, 276, '資料DL', 96);

  // ---- HR領域 ----
  zone(300, 372, 250, 176, 'HR領域', '#c084fc');
  logo(316, 404, 'linkedin', 'LinkedIn');
  logo(316, 472, 'indeed', 'Indeed');

  // ---- セールス領域 (with Salesforce base band) ----
  band(568, 116, 470, 452, 'Salesforce 基盤', '#00A1E0');
  zone(580, 96, 450, 456, 'セールス領域', '#7c5cff');
  logo(596, 132, 'salesforce', 'Salesforce');
  logo(786, 132, 'hubspot', 'HubSpot');
  const cards = list(596, 206, '名刺 / 会話データ', ['sansan 連携', 'リッチ化', 'リスク評価'], '#00A1E0');
  const sLead = box(596, 344, 'リード');
  const sTori = box(596, 404, '取引先');
  const sTanto = box(596, 464, '取引先責任者');
  const sSho = box(786, 344, '商談');
  const sAct = box(786, 404, '活動履歴');
  const sMi = box(786, 464, '見積り');
  const sKe = box(916, 344, '契約');
  const sChu = box(916, 404, '注文');
  txt(724, 320, '商談更新');

  // ---- バックオフィス領域 ----
  zone(1064, 96, 240, 300, 'バックオフィス領域', '#43d19e');
  logo(1080, 132, 'stripe', 'Stripe / 決済');
  const oSei = box(1080, 210, '請求・売上');
  const oShin = box(1080, 270, '申請');
  const oJu = box(1080, 330, '受注承認');

  // ---- 経営 / BI ----
  zone(1064, 420, 240, 128, '経営判断 / BI', '#ffb454');
  logo(1080, 452, 'tableau', 'Tableau');
  txt(1080, 520, 'アカウント毎の見込み金額');

  const edges = []; let e = 0;
  const E = (from, to, label = '', style = 'solid', dir = 'forward') => edges.push({ id: 'e' + (++e), from: from.id, to: to.id, label, style, dir, route: 'orthogonal', color: '' });
  E(mLead, sLead, '集客'); E(mDoc, sLead, '', 'dashed');
  E(cards, sTori, '取込', 'dashed');
  E(sLead, sTori); E(sTori, sSho); E(sTanto, sSho); E(sSho, sAct); E(sAct, sMi); E(sMi, sKe); E(sKe, sChu);
  E(sKe, oSei, '受注', 'dashed'); E(oSei, oShin); E(oShin, oJu);
  E(boxList, sSho, '議事録', 'dotted');
  E(oSei, cards, '', 'dotted', 'none');

  const order = [...back.map((o) => o.id), ...front.map((o) => o.id)];
  const state = { nodes: {}, edges: {}, order, counter: 400 };
  [...back, ...front].forEach((o) => (state.nodes[o.id] = o));
  edges.forEach((x) => (state.edges[x.id] = x));
  return { version: 1, state };
}

/* ---------------- mobile drawers ---------------- */
const backdrop = $('#drawer-backdrop');
function openDrawer(which) {
  $('#palette').classList.toggle('open', which === 'palette');
  $('#inspector').classList.toggle('open', which === 'inspector');
  backdrop.classList.toggle('show', !!which);
}
const closeDrawers = () => openDrawer(null);
$('#fab-parts').addEventListener('click', () => openDrawer($('#palette').classList.contains('open') ? null : 'palette'));
$('#fab-insp').addEventListener('click', () => openDrawer($('#inspector').classList.contains('open') ? null : 'inspector'));
backdrop.addEventListener('click', closeDrawers);
// placing a part from the drawer closes it so the canvas is visible
$('#palette-body').addEventListener('click', (e) => { if (e.target.closest('.pal-item')) setTimeout(closeDrawers, 80); });
// pulse the edit FAB when a node/edge is selected
editor.on('select', (sel) => $('#fab-insp').classList.toggle('has-sel', !!(sel && sel.kind)));

/* ---------------- context menu (right-click / long-press) ---------------- */
const ctxMenu = $('#context-menu');
function showContextMenu(clientX, clientY) {
  const multi = editor.selNodes.size > 1;
  const isNode = editor.sel.kind === 'node';
  const items = [];
  if (isNode && !multi) items.push(['dup', '⧉ 複製'], ['front', '⬆ 前面へ'], ['back', '⬇ 背面へ']);
  if (multi) items.push(['al-left', '⇤ 左揃え'], ['al-top', '⤒ 上揃え'], ['di-h', '⇔ 水平等間隔']);
  if (isNode || multi || editor.sel.kind === 'edge') items.push(['del', '🗑 削除']);
  if (!items.length) return;
  ctxMenu.innerHTML = items.map(([a, l]) => `<button data-ctx="${a}">${l}</button>`).join('');
  ctxMenu.hidden = false;
  const mw = 170, mh = items.length * 38 + 12;
  ctxMenu.style.left = Math.min(clientX, innerWidth - mw - 8) + 'px';
  ctxMenu.style.top = Math.min(clientY, innerHeight - mh - 8) + 'px';
}
const hideContextMenu = () => { ctxMenu.hidden = true; };
ctxMenu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ctx]'); if (!b) return;
  const a = b.dataset.ctx;
  if (a === 'dup') editor.duplicateSelected();
  else if (a === 'front') editor.bringToFront();
  else if (a === 'back') editor.sendToBack();
  else if (a === 'del') editor.deleteSelected();
  else if (a === 'al-left') editor.alignSelected('left');
  else if (a === 'al-top') editor.alignSelected('top');
  else if (a === 'di-h') editor.distributeSelected('h');
  hideContextMenu();
});
svg.addEventListener('contextmenu', (e) => {
  const nodeEl = e.target.closest('.node-g'), edgeEl = e.target.closest('.edge-g');
  if (nodeEl) { e.preventDefault(); if (!editor.selNodes.has(nodeEl.dataset.id)) editor.select('node', nodeEl.dataset.id); showContextMenu(e.clientX, e.clientY); }
  else if (edgeEl) { e.preventDefault(); editor.select('edge', edgeEl.dataset.id); showContextMenu(e.clientX, e.clientY); }
});
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#context-menu')) hideContextMenu(); }, true);
addEventListener('blur', hideContextMenu);
// long-press on touch opens the same menu
let lpTimer = null, lpStart = null;
svg.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  const nodeEl = e.target.closest('.node-g'); if (!nodeEl) return;
  lpStart = { x: e.clientX, y: e.clientY, id: nodeEl.dataset.id };
  lpTimer = setTimeout(() => { if (!editor.selNodes.has(lpStart.id)) editor.select('node', lpStart.id); showContextMenu(lpStart.x, lpStart.y); lpTimer = null; }, 500);
});
svg.addEventListener('pointermove', (e) => { if (lpTimer && lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 8) { clearTimeout(lpTimer); lpTimer = null; } });
svg.addEventListener('pointerup', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });

/* ---------------- boot ---------------- */
if (!editor.loadAutosave()) {
  editor.loadJSON(demoDiagram());
} else {
  editor.fitView();
}
editor.select(null, null);
