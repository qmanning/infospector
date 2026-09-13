/*
 * Infospector — host controller.
 * Floating frosted toolbar + centered resizable stage + typeahead (with history)
 * + select-first inspector + draggable per-object note modals with pinned markers
 * + light/dark toggle + robot API. Framework-agnostic; inspection needs same-origin.
 */
import { resolveStore, emptyDoc } from './adapters.js';

/* ---------------- presets & constants -------------------------------- */

/*
 * Size presets, in menu order. `shape` drives the stage's corner radius:
 *   browser — a desktop browser viewport: flat top corners, rounded bottom (r)
 *   device  — a phone/tablet/watch screen: all four corners rounded (r)
 * Radii are in logical CSS px and scale with the stage.
 * Phone/Pixel entries are the newest models known at authoring time — edit freely.
 */
const BROWSER_R = 10;
import * as L from './lib.js';
const { radiusCss, STATES, STATE_COLORS, LEGACY_STATES, normState, tickSteps, hslOf, forTheme, lumOf, mixCss, contrast, hsbToHex, formatColor, humanize, isUrlish, toHex, rgbOf } = L;
const migrate = (doc) => L.migrate(doc, uid);
const parseColor = (str) => L.parseColor(str, (v) => !!(window.CSS && CSS.supports('color', v)));
const shortUrl = (u) => L.shortUrl(u, location.origin);
const pagePath = (href) => L.pagePath(href, { origin: location.origin, base: PT_BASE });
const allPages = () => L.mergePages(state.pages, state.sitemap, state.discovered);
// named colors, color-mix(), etc. resolve through a canvas when we're in a browser
L.setColorFallback((css) => { try { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = '#000000'; c.fillStyle = css; const v = c.fillStyle; const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(v); return v[0] === '#' ? L.parseRgb(v) : m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 } : null; } catch (e) { return null; } });

const PRESETS = [
  { w: 1920, h: 1080, name: 'HD', shape: 'browser', r: BROWSER_R },
  { w: 1878, h: 2670, name: 'iPhone Duo Inner', shape: 'device', r: 44 },
  { w: 1440, h: 1024, name: 'Figma', shape: 'browser', r: BROWSER_R },
  { w: 1398, h: 2034, name: 'iPhone Duo Outer', shape: 'device', r: 55 },
  { w: 1280, h: 960, name: 'iPad Pro', shape: 'device', r: 18 },
  { w: 1280, h: 720, name: 'Laptop', shape: 'browser', r: BROWSER_R },
  { w: 1024, h: 768, name: 'iPad HZ', shape: 'device', r: 18 },
  { w: 768, h: 1024, name: 'iPad VT', shape: 'device', r: 18 },
  { w: 640, h: 800, name: '', shape: 'device', r: 24 },
  { w: 440, h: 956, name: 'iPhone 17 Pro Max', shape: 'device', r: 55 },
  { w: 402, h: 874, name: 'iPhone 17 / 17 Pro', shape: 'device', r: 55 },
  { w: 448, h: 998, name: 'Pixel 10 Pro XL', shape: 'device', r: 40 },
  { w: 412, h: 915, name: 'Pixel 10', shape: 'device', r: 40 },
  { w: 375, h: 814, name: 'Mobile', shape: 'device', r: 24 },
  { w: 384, h: 824, name: 'Galaxy S25 Ultra', shape: 'device', r: 32 },
  { w: 360, h: 780, name: 'Galaxy S25', shape: 'device', r: 32 },
  { w: 416, h: 496, name: 'Apple Watch 46mm', shape: 'device', r: 92 },
  { w: 374, h: 446, name: 'Apple Watch 42mm', shape: 'device', r: 82 },
  { w: 410, h: 502, name: 'Apple Watch Ultra', shape: 'device', r: 90 }
];
const BROWSER_SHAPE = { shape: 'browser', r: BROWSER_R };

const PT_BASE = location.pathname.replace(/[^/]*$/, '');
// page to open on launch: ?url=…, else window.INFOSPECTOR_HOME, else this origin's homepage,
// else (not served over http, e.g. opened from disk) the demo site
// with nothing configured and no history, the first thing on stage is the bundled how-to page
const DEFAULT_HOME = (location.protocol === 'http:' || location.protocol === 'https:') ? location.origin + PT_BASE + 'welcome.html' : 'https://qmanning.com';
const SIZE_KEY = 'pt:size', HISTORY_KEY = 'pt:history', HISTORY_MAX = 5, THEME_KEY = 'pt:theme';

const ICONS = {
  pencil: svg('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
  ruler: svg('<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  moon: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  notebookPen: svg('<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4M2 10h4M2 14h4M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>'),
  rulerDim: svg('<path d="M12 15v-3M16 15v-3M8 15v-3"/><path d="M20 6H4M20 8V4M4 8V4"/><rect x="3" y="12" width="18" height="7" rx="1"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  ban: svg('<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>'),
  grip: svg('<circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/><circle cx="5" cy="19" r="1"/>'),
  grid3: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
  diagonal: svg('<path d="M3 21L21 3M3 13L13 3M11 21L21 11M19 21L21 19M3 5L4.5 3.5"/>'),
  keyboard: svg('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>'),
  shredder: svg('<path d="M10 22v-5"/><path d="M14 19v-2"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M18 20v-3"/><path d="M2 13h20"/><path d="M20 13V7l-5-5H6a2 2 0 0 0-2 2v9"/><path d="M6 20v-3"/>'),
  rotateCcw: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>'),
  copy: svg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6M14 11v6"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  camera: svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>'),
  crosshair: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  dots: svg('<circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/><circle cx="5" cy="12" r="1.4"/>')
};
function svg(inner) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>'; }

/* ---------------- element refs --------------------------------------- */

const $ = (id) => document.getElementById(id);
const el = {
  dim: $('pt-dim'), dimTrigger: $('pt-dim-trigger'), dimVal: $('pt-dim-val'), dimChev: $('pt-dim-chev'), dimPop: $('pt-dim-pop'),
  dimW: $('pt-dim-w'), dimH: $('pt-dim-h'),
  bar: $('pt-bar'), tip: $('pt-tip'), inspect: $('pt-inspect'), shot: $('pt-shot'), theme: $('pt-theme'),
  omniWrap: $('pt-omni'), omni: $('pt-omni-input'), omniIcon: $('pt-omni-icon'), omniClear: $('pt-omni-clear'), results: $('pt-omni-results'),
  menu: $('pt-menu'), menuBtn: $('pt-menu-btn'), menuPop: $('pt-menu-pop'),
  copyAllBtn: $('pt-copy-all'), exportBtn: $('pt-export'), importBtn: $('pt-import'), clearBtn: $('pt-clear'), importInput: $('pt-import-input'),
  stagewrap: $('pt-stagewrap'), stage: $('pt-stage'), viewport: $('pt-stage-viewport'), frame: $('pt-frame'),
  ovEmpty: $('pt-overlay-empty'), ovBlocked: $('pt-overlay-blocked'),
  selbox: $('pt-selbox'), sbName: $('pt-sb-name'), sbSel: $('pt-sb-sel'), sbInfo: $('pt-sb-info'), addNote: $('pt-add-note'), rulerBtn: $('pt-ruler'),
  gaps: $('pt-gaps'), rulerTop: $('pt-ruler-top'), rulerLeft: $('pt-ruler-left'), rulerCorner: $('pt-ruler-corner'), guides: $('pt-guides'),
  ctx: $('pt-ctx'), bgOpacity: $('pt-bg-opacity'), bgOpacityVal: $('pt-bg-opacity-val'),
  colPattern: $('pt-col-pattern'), colPatternTxt: $('pt-col-pattern-txt'), colGround: $('pt-col-ground'), colGroundTxt: $('pt-col-ground-txt'), colAccent: $('pt-col-accent'), colAccentTxt: $('pt-col-accent-txt'),
  apSave: $('pt-ap-save'), apCopy: $('pt-ap-copy'), colFmt: $('pt-col-fmt'),
  apBlur: $('pt-ap-blur'), apBacking: $('pt-ap-backing'), apSat: $('pt-ap-sat'), apLight: $('pt-ap-light'), apDark: $('pt-ap-dark'), apTint: $('pt-ap-tint'), apColor: $('pt-ap-color'), apColorTxt: $('pt-ap-color-txt'), apReset: $('pt-ap-reset'),
  modals: $('pt-modals'), toast: $('pt-toast')
};

/* ---------------- state ---------------------------------------------- */

const state = {
  w: 1280, h: 960, scale: 1, fillMode: false, custom: false, shape: BROWSER_SHAPE,
  mode: 'view', frameMode: 'empty',
  url: null, pageKey: null,
  pages: [], activeIdx: -1,
  targets: [], store: null, unsubscribe: null, loadTimer: null,
  selected: null, selPinned: false, hoverTimer: null,   // info box: transient on hover, pinned by a click
  activeRulers: new Set(), modalZ: 111, modalCount: 0,
  rulers: false, peek: false,                         // peek: Shift held outside inspect mode → boxes + rulers
  guides: [], selectedGuide: null, snap: null,        // guides: [{ id, axis: 'x'|'y', pos, for?, snap? }] in logical px; snap: element edges from the frame
  discovered: {}, sitemap: [],
  bg: { pattern: 'dots', opacity: 50, patternColor: null, groundColor: null, patternTheme: null, groundTheme: null, accent: null },  // null = theme default; *Theme = theme the color was picked in
  glass: { blur: null, sat: null, light: null, dark: null, tint: null, color: null, colorTheme: null, backing: null }   // Appearance; null = recipe default
};

/* ---------------- toast ---------------------------------------------- */

let toastTimer = null;
// in-app confirm: native confirm() returns false without asking inside embedded browsers
function askConfirm(msg, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const box = $('pt-confirm'), ok = $('pt-confirm-ok'), cancel = $('pt-confirm-cancel');
    $('pt-confirm-msg').textContent = msg; ok.textContent = okLabel; box.hidden = false; ok.focus();
    const done = (v) => { box.hidden = true; ok.onclick = cancel.onclick = box.onclick = null; document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    ok.onclick = () => done(true); cancel.onclick = () => done(false);
    box.onclick = (e) => { if (e.target === box) done(false); };
    document.addEventListener('keydown', onKey, true);
  });
}
function toast(msg) { el.toast.textContent = msg; el.toast.classList.add('pt-show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('pt-show'), 1900); }

/* ---------------- sizing / zoom / fit -------------------------------- */

// usable area inside the stage wrap, honoring its CSS padding (top pad clears the toolbar)
// (the padding eases, so read the custom-prop *targets* rather than the in-flight computed padding)
function wrapPads() {
  const cs = getComputedStyle(el.stagewrap);
  return { top: parseFloat(cs.getPropertyValue('--pt-pad-top')) || 74, left: parseFloat(cs.getPropertyValue('--pt-pad-left')) || 28, right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom) };
}
function availArea() {
  const p = wrapPads();
  return { w: Math.max(200, el.stagewrap.clientWidth - p.left - p.right), h: Math.max(200, el.stagewrap.clientHeight - p.top - p.bottom) };
}

function fit() {
  const a = availArea();
  const s = state.fillMode ? 1 : Math.min(1, a.w / state.w, a.h / state.h);
  state.scale = s;
  el.viewport.style.width = state.w + 'px';
  el.viewport.style.height = state.h + 'px';
  el.viewport.style.transform = `scale(${s})`;
  el.stage.style.width = Math.round(state.w * s) + 'px';
  el.stage.style.height = Math.round(state.h * s) + 'px';
  // device-shaped corners: the bordered outer box gets the scaled radius; the viewport (which does
  // all the clipping — the iframe itself stays square to avoid double anti-aliasing) gets the
  // logical radius minus the 1px border so the two curves sit flush
  el.stage.style.borderRadius = radiusCss(state.shape, s, state.rulers);
  el.viewport.style.borderRadius = radiusCss({ shape: state.shape.shape, r: Math.max(0, state.shape.r - 1 / s) }, 1, state.rulers);
  // the rulers take over the corners the stage squared off (top-left via the corner block,
  // bottom-left via the left ruler; device shapes also round the top ruler's far end)
  const rs = Math.round(state.shape.r * s * 10) / 10, dev = state.shape.shape === 'device';
  el.rulerCorner.style.borderRadius = dev ? `${rs}px 0 0 0` : '0';
  el.rulerLeft.style.borderRadius = `0 0 0 ${rs}px`;
  el.rulerTop.style.borderRadius = dev ? `0 ${rs}px 0 0` : '0';
  const fitting = !state.fillMode && s < 1;
  document.body.classList.toggle('pt-fit', fitting);
  el.dimTrigger.classList.toggle('pt-fit-glow', fitting);
  el.dimVal.innerHTML = `${state.w} × ${state.h}` + (fitting ? `<span class="pt-dim-scale" data-tip="Scaled to Show All">· ${Math.round(s * 100)}%</span>` : '');
  drawRulers();
  positionGuides();
  placeSelbox();
  layoutBar();
}

// the toolbar spans the stage's width (never narrower than its items side by side) and is
// centered on the stage — computed from the *target* geometry so it animates in step with it
function layoutBar() {
  const s = state.scale, stageW = Math.round(state.w * s) + 2;   // + 1px border each side
  // measure the bar's natural minimum with transitions off, then put it back where it was before
  // asking for the new width — otherwise the flush at width:auto restarts the width tween from there
  const prevW = el.bar.style.width;
  el.bar.style.transition = 'none';
  el.bar.style.width = 'auto'; el.omniWrap.style.flex = '0 0 160px';
  const minW = el.bar.offsetWidth;                                // everything side by side, URL bar at its minimum
  el.omniWrap.style.flex = ''; el.bar.style.width = prevW;
  void el.bar.offsetWidth;                                        // flush at the old width
  el.bar.style.transition = '';
  const w = Math.min(window.innerWidth - 24, Math.max(stageW, minW));
  const p = wrapPads(), wr = el.stagewrap.getBoundingClientRect();
  const cx = wr.left + p.left + (el.stagewrap.clientWidth - p.left - p.right) / 2;
  el.bar.style.width = w + 'px';
  el.bar.style.left = Math.max(12, Math.min(cx - w / 2, window.innerWidth - w - 12)) + 'px';
}

/*
 * setSize(w, h, opts)
 *   fill   — track the window (Fit to Window)
 *   shape  — corner shape; omitted = plain browser window (used for custom / dragged sizes)
 *   custom — show the inline W × H inputs in the trigger
 */
function setSize(w, h, { animate = true, fill = false, shape = null, custom = false } = {}) {
  state.fillMode = fill;
  state.custom = custom;
  state.shape = shape || BROWSER_SHAPE;
  state.w = Math.max(200, Math.round(w));
  state.h = Math.max(200, Math.round(h));
  el.stage.classList.toggle('pt-no-anim', !animate);
  el.dimVal.textContent = `${state.w} × ${state.h}`;
  el.dimW.value = state.w; el.dimH.value = state.h;
  el.dim.classList.toggle('pt-custom', custom);
  persistSize();
  requestAnimationFrame(fit);
}
function enterFill() { const a = availArea(); setSize(a.w, a.h, { fill: true }); }
function enterCustom({ focus = true } = {}) {
  setSize(state.w, state.h, { custom: true });
  if (focus) requestAnimationFrame(() => { el.dimW.focus(); el.dimW.select(); });
}
function persistSize() { try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w: state.w, h: state.h, fill: state.fillMode, custom: state.custom, shape: state.shape })); } catch (e) { /* ignore */ } }

/* ---------------- dimensions dropdown -------------------------------- */

function dimRow(num, name, onPick) {
  const row = document.createElement('div'); row.className = 'pt-dim-row'; row.setAttribute('role', 'menuitem');
  const n = document.createElement('span'); n.className = 'pt-dim-num'; n.textContent = num; row.appendChild(n);
  if (name) { const l = document.createElement('span'); l.className = 'pt-dim-name'; l.textContent = name; row.appendChild(l); }
  row.addEventListener('click', () => { onPick(); closeDim(); });
  return row;
}
function buildDimPop() {
  el.dimPop.innerHTML = '';
  PRESETS.forEach((d) => {
    const row = dimRow(`${d.w} × ${d.h}`, d.name ? `(${d.name})` : '', () => setSize(d.w, d.h, { shape: { shape: d.shape, r: d.r } }));
    row.dataset.w = d.w; row.dataset.h = d.h;
    el.dimPop.appendChild(row);
  });
  el.dimPop.appendChild(divider());
  const custom = dimRow('Custom', 'type a size', () => enterCustom()); custom.dataset.custom = '1';
  el.dimPop.appendChild(custom);
  const fill = dimRow('Fit to Window', 'tracks the viewport', () => enterFill()); fill.dataset.fill = '1';
  el.dimPop.appendChild(fill);
}
function divider() { const d = document.createElement('div'); d.className = 'pt-dim-div'; return d; }
// popovers are body-level (see index.html); pin one under its trigger, kept on screen
function anchorPop(pop, anchor, { align = 'left', width = null, above = false } = {}) {
  const r = anchor.getBoundingClientRect();
  if (width) pop.style.width = width + 'px';
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.top = (above ? Math.max(8, r.top - 8 - ph) : r.bottom + 8) + 'px';
  const x = align === 'right' ? r.right - pw : align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
  pop.style.left = Math.max(8, Math.min(x, window.innerWidth - pw - 8)) + 'px';
}
function openDim() { syncDimActive(); showPop(el.dimPop); anchorPop(el.dimPop, el.dimTrigger); el.dimVal.setAttribute('aria-expanded', 'true'); }
function closeDim() { hidePop(el.dimPop); el.dimVal.setAttribute('aria-expanded', 'false'); }
function syncDimActive() {
  el.dimPop.querySelectorAll('.pt-dim-row').forEach((r) => {
    const active = (state.fillMode && r.dataset.fill === '1') ||
      (state.custom && r.dataset.custom === '1') ||
      (!state.fillMode && !state.custom && Number(r.dataset.w) === state.w && Number(r.dataset.h) === state.h);
    r.classList.toggle('pt-active', !!active);
  });
}

/* ---------------- theme ---------------------------------------------- */

function currentTheme() { return document.documentElement.getAttribute('data-pt-theme') === 'light' ? 'light' : 'dark'; }
function setTheme(t) { document.documentElement.setAttribute('data-pt-theme', t); try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ } updateThemeIcon(); applyBg(); applyGlass(); }
function updateThemeIcon() { el.theme.innerHTML = currentTheme() === 'light' ? ICONS.sun : ICONS.moon; el.theme.dataset.tip = currentTheme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'; }
function toggleTheme() { setTheme(currentTheme() === 'light' ? 'dark' : 'light'); }

/* ---------------- history -------------------------------------------- */

function getHistory() { try { const a = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function pushHistory(url) { try { let a = getHistory().filter((u) => u !== url); a.unshift(url); a = a.slice(0, HISTORY_MAX); localStorage.setItem(HISTORY_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } }
function displayUrl(u) { return u; }   // the URL bar shows the full address of the page on stage

/* ---------------- corner resize -------------------------------------- */

function bindHandles() {
  // handles + blue outline show only while the pointer is near the stage edge (or mid-drag)
  let dragging = false;
  document.querySelectorAll('.pt-edge, .pt-handle').forEach((n) => {
    n.addEventListener('pointerenter', () => el.stage.classList.add('pt-edge-hover'));
    n.addEventListener('pointerleave', () => { if (!dragging) el.stage.classList.remove('pt-edge-hover'); });
  });
  document.querySelectorAll('.pt-handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const corner = handle.dataset.corner;
      const scale = (el.stage.getBoundingClientRect().width / state.w) || 1;
      const startX = e.clientX, startY = e.clientY, startW = state.w, startH = state.h;
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      dragging = true;
      handle.classList.add('pt-dragging');
      const move = (ev) => {
        let dw = (ev.clientX - startX) / scale, dh = (ev.clientY - startY) / scale;
        if (corner === 'nw') { dw = -dw; dh = -dh; } else if (corner === 'ne') { dh = -dh; } else if (corner === 'sw') { dw = -dw; }
        // a hand-dragged size is a custom size: keep the inline inputs live, browser-shaped corners
        setSize(startW + dw, startH + dh, { animate: false, custom: true });
      };
      const up = () => { try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } dragging = false; handle.classList.remove('pt-dragging'); el.stage.classList.remove('pt-edge-hover'); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  });
}

/* ---------------- frame loading -------------------------------------- */

function resolveUrl(input) { const raw = input.trim(); if (!raw) return null; if (/^https?:\/\//i.test(raw)) return raw; if (raw.startsWith('/')) return location.origin + raw; return location.origin + '/' + raw.replace(/^\/+/, ''); }
function loadTarget(input) {
  const url = resolveUrl(input); if (!url) return;
  state.url = url;
  el.omni.value = displayUrl(url); el.omniWrap.classList.toggle('pt-has-value', !!el.omni.value);
  el.ovEmpty.classList.remove('pt-show'); el.ovBlocked.classList.remove('pt-show');
  setFrameMode('empty');
  clearTimeout(state.loadTimer);
  state.loadTimer = setTimeout(() => { if (state.frameMode === 'empty') { el.ovBlocked.classList.add('pt-show'); setFrameMode('blocked'); } }, 12000);
  el.frame.src = url;
}
// the search icon doubles as the inspectability indicator: a "ban" icon when the page can't be inspected
function setFrameMode(m) {
  state.frameMode = m;
  const blocked = m === 'viewonly' || m === 'blocked';
  el.omniIcon.innerHTML = blocked ? ICONS.ban : ICONS.search;
  el.omniIcon.classList.toggle('pt-blocked', blocked);
  el.omniIcon.style.pointerEvents = blocked ? 'auto' : 'none';   // only the ban icon gets a tooltip
  el.omniIcon.dataset.tip = m === 'blocked' ? 'Not inspectable · this site refused to load in the stage' : 'Not inspectable · external pages are view-only';
  el.inspect.disabled = m !== 'full';
  if (m !== 'full' && state.mode === 'inspect') setInspect(false);
}
async function onFrameLoad() {
  clearTimeout(state.loadTimer);
  if (!state.url) return;
  el.ovEmpty.classList.remove('pt-show'); el.ovBlocked.classList.remove('pt-show');
  let doc = null; try { doc = el.frame.contentDocument; } catch (e) { doc = null; }
  if (!doc) { setFrameMode('viewonly'); pushHistory(state.url); await switchPage(state.url); return; }
  setFrameMode('full');
  try { const win = el.frame.contentWindow; if (!win.__ptInspector) { const s = doc.createElement('script'); s.src = PT_BASE + 'inspector.js'; doc.body.appendChild(s); } } catch (e) { setFrameMode('viewonly'); }
  // the frame may have navigated (link click, redirect): follow it in the URL bar + history
  const realUrl = (() => { try { return el.frame.contentWindow.location.href; } catch (e) { return state.url; } })();
  state.url = realUrl;
  el.omni.value = displayUrl(realUrl); el.omniWrap.classList.toggle('pt-has-value', !!el.omni.value);
  pushHistory(realUrl);
  harvestLinks(doc);
  await switchPage(realUrl);
}

/* ---------------- inspect + selection -------------------------------- */

// inspect mode brings the rulers with it
function setInspect(on) { state.mode = on ? 'inspect' : 'view'; el.inspect.setAttribute('aria-pressed', String(on)); postToFrame({ type: 'mode', mode: state.mode }); setRulers(on || state.peek); if (!on) hideSelbox(); }
// holding Shift outside inspect mode previews the inspection chrome (hover boxes + rulers)
function setPeek(on) {
  on = !!on; if (state.peek === on) return;
  state.peek = on;
  if (state.mode !== 'inspect') setRulers(on);
  postToFrame({ type: 'peek', on });
}
// inspection is same-origin only, so pin the target origin: a cross-origin frame never receives these
function postToFrame(msg) { try { el.frame.contentWindow.postMessage(Object.assign({ __pt: 1, from: 'host' }, msg), location.origin); } catch (e) { /* no-op */ } }

function showSelbox(sel, { pin = true } = {}) {
  clearTimeout(state.hoverTimer);
  state.selected = sel; state.selPinned = pin;
  const e = sel.payload, r = e.rect || {}, isRegion = e.tag === 'region', isMulti = e.tag === 'multi';
  // ID row: name + selector · Info row: size / z-index / id (or what an area touches)
  el.sbName.textContent = isRegion ? 'Area' : (e.name || e.tag);
  el.sbSel.textContent = isRegion ? 'shift-drag selection' : isMulti ? '⇧⌘-click selection' : ((e.selectors && e.selectors[0]) || e.tag);
  el.sbName.dataset.copy = el.sbName.textContent; el.sbSel.dataset.copy = isRegion || isMulti ? '' : el.sbSel.textContent;
  const parts = [`<span data-copy="${Math.round(r.width)}×${Math.round(r.height)}"><b>${Math.round(r.width)}</b>×<b>${Math.round(r.height)}</b></span>`];
  if (isRegion) {
    const t = e.touching || [];
    parts.push(`<span class="pt-sb-touch">${t.length ? `touches ${t.length}: ${escapeHtml(t.slice(0, 4).map((x) => x.name).join(', '))}${t.length > 4 ? '…' : ''}` : 'touches nothing'}</span>`);
  } else if (isMulti) {
    const m = e.members || [];
    parts.push(`<span class="pt-sb-touch">${escapeHtml(m.slice(0, 4).map((x) => x.name).join(', '))}${m.length > 4 ? '…' : ''}</span>`);
  } else {
    if (e.id) parts.push(`<span data-copy="#${escapeHtml(e.id)}">#${escapeHtml(e.id)}</span>`);
    if (e.components && e.components.length) parts.push(`<span class="pt-sb-touch" data-copy="${escapeHtml(e.components.join(' › '))}">${escapeHtml(e.components.slice(0, 2).join(' › '))}</span>`);
    parts.push(`<span class="pt-sb-z" data-copy="z-index: ${escapeHtml(e.zIndex || 'auto')}">z <b>${escapeHtml(e.zIndex || 'auto')}</b></span>`);
  }
  el.sbInfo.innerHTML = parts.join('');
  el.rulerBtn.disabled = isRegion || isMulti;
  el.selbox.classList.toggle('pt-region', isRegion);
  showPop(el.selbox, { attr: true });
  placeSelbox();
}
// float the box just above the selected element (below it if there's no room), caret on its center
function placeSelbox() {
  const sel = state.selected; if (!sel || el.selbox.hidden) return;
  const r = sel.payload.rect || { x: 0, y: 0, width: 0, height: 0 };
  const vr = el.viewport.getBoundingClientRect(), s = state.scale;
  const ex = vr.left + r.x * s, ey = vr.top + r.y * s, ew = r.width * s, eh = r.height * s;
  el.selbox.style.width = Math.max(320, Math.min(Math.round(ew), window.innerWidth - 16)) + 'px';   // as wide as the element, never narrower than 320
  const bw = el.selbox.offsetWidth, bh = el.selbox.offsetHeight;
  const barBottom = document.getElementById('pt-bar').getBoundingClientRect().bottom;
  const cx = ex + ew / 2;
  const left = Math.max(8, Math.min(cx - bw / 2, window.innerWidth - bw - 8));
  let top = ey - bh - 10, below = false;
  if (top < barBottom + 6) { top = ey + eh + 10; below = true; }
  top = Math.max(barBottom + 6, Math.min(top, window.innerHeight - bh - 8));
  el.selbox.style.left = left + 'px'; el.selbox.style.top = top + 'px';
  el.selbox.classList.toggle('pt-below', below);
}
function hideSelbox() {
  clearTimeout(state.hoverTimer);
  const sel = state.selected; hidePop(el.selbox, { attr: true }); state.selPinned = false; postToFrame({ type: 'clearSelection' });
  if (sel && sel.anchor && sel.anchor.selector) { const t = findTargetBySelector(sel.anchor.selector); if (!t || !t.ruler) setRuler(sel.anchor.selector, false); }
  state.selected = null;
}
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------------- targets / notes model ------------------------------ */

function pageKeyFor(url) { try { const u = new URL(url); return u.origin === location.origin ? u.pathname : (u.origin + u.pathname); } catch (e) { return url; } }
function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function aggState(t) { let min = 3; t.notes.forEach((n) => { const i = STATES.indexOf(n.state); if (i >= 0 && i < min) min = i; }); return STATES[min] || 'open'; }
function findTargetBySelector(selector) { if (!selector) return null; return state.targets.find((t) => t.anchor && t.anchor.selector === selector) || null; }
function findTargetByMulti(multi) { const k = JSON.stringify(multi); return state.targets.find((t) => t.anchor && t.anchor.multi && JSON.stringify(t.anchor.multi) === k) || null; }
function findTargetByRegion(region) { const k = JSON.stringify(region); return state.targets.find((t) => t.anchor && t.anchor.region && JSON.stringify(t.anchor.region) === k) || null; }
function findNote(noteId) { for (const t of state.targets) { const n = t.notes.find((x) => x.id === noteId); if (n) return { target: t, note: n }; } return null; }
// what gets written: drafts (unsaved new notes) are left out, and objects with nothing saved vanish
function docForSave() {
  const doc = emptyDoc(state.pageKey);
  doc.targets = state.targets.map((t) => Object.assign({}, t, { notes: t.notes.filter((n) => !n._draft) })).filter((t) => t.notes.length);
  return doc;
}

async function switchPage(url) {
  state.pageKey = pageKeyFor(url);
  if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }
  const doc = migrate(await state.store.load(state.pageKey));
  state.targets = doc.targets || [];
  closeAllModals(); state.activeRulers.clear();
  loadGuides();
  renderAll();
  state.targets.forEach((t) => { if (t.ruler) setRuler(t.anchor.selector, true); if (t.modal && t.modal.open) openModal(t.id, { reveal: true }); });
  state.unsubscribe = state.store.subscribe(state.pageKey, async () => { const fresh = migrate(await state.store.load(state.pageKey)); state.targets = fresh.targets || []; renderAll(); });
}
// save(): write + refresh markers and modal header dots in place (no modal rebuild —
// rebuilding on a textarea blur would swallow the click that caused the blur).
// persist(): save + rebuild modals; use for structural changes (add/delete/open/close/import).
async function save() {
  await state.store.save(state.pageKey, docForSave());
  pushPins();
  updateNotesBadge();
  Object.keys(modalEls).forEach((id) => { const t = state.targets.find((x) => x.id === id); const dot = t && modalEls[id].querySelector('.pt-dot-state'); if (dot) dot.style.background = STATE_COLORS[aggState(t)]; });
}
async function persist() { await save(); renderModals(); }
function renderAll() { pushPins(); renderModals(); updateNotesBadge(); }

/* ---------------- markers -------------------------------------------- */

// markers show how many notes on that object are still open (✓ once they're all done)
function pushPins() {
  renderGuides();   // guide-note markers live on the guides
  postToFrame({ type: 'renderPins', pins: state.targets.filter((t) => !(t.anchor && t.anchor.guide)).map((t) => ({
    id: t.id, count: t.notes.length, remaining: t.notes.filter((n) => n.state !== 'done').length, state: aggState(t), anchor: t.anchor
  })) });
}
// toolbar notes button: with no notes it's a plain Import button; otherwise the badged notes
// pill whose menu holds Copy all / Export / Import / Clear
function updateNotesBadge() {
  const n = docForSave().targets.reduce((a, t) => a + t.notes.length, 0);
  state.notesEmpty = n === 0;
  el.menuBtn.classList.toggle('pt-badge-btn', n > 0);
  if (n === 0) {
    el.menuBtn.innerHTML = ICONS.upload; el.menuBtn.dataset.tip = 'Import notes'; el.menuBtn.setAttribute('aria-label', 'Import notes');
    hidePop(el.menuPop);
  } else {
    el.menuBtn.innerHTML = ICONS.notebookPen + '<span class="pt-badge">' + n + '</span>';
    el.menuBtn.querySelector('.pt-badge').classList.toggle('pt-wide', n > 9);
    el.menuBtn.dataset.tip = 'Notes on this page · export, import, clear'; el.menuBtn.setAttribute('aria-label', 'Notes');
  }
  layoutBar();   // the pill and the round button differ in width
}

/* ---------------- notes actions -------------------------------------- */

function addNoteToSelected() {
  const sel = state.selected; if (!sel) return;
  let t = sel.anchor.region ? findTargetByRegion(sel.anchor.region) : sel.anchor.multi ? findTargetByMulti(sel.anchor.multi) : findTargetBySelector(sel.anchor.selector);
  const now = new Date().toISOString();
  if (!t) { t = { id: uid('t'), createdAt: now, updatedAt: now, anchor: sel.anchor, element: sel.payload, ruler: !sel.anchor.region && !sel.anchor.multi && state.activeRulers.has(sel.anchor.selector), modal: { x: null, y: null, open: true }, notes: [] }; state.targets.push(t); }
  else t.modal.open = true;
  t.notes.push({ id: uid('n'), text: '', state: 'open', createdAt: now, updatedAt: now, _draft: true });
  persist(); openModal(t.id, { reveal: false, focusLast: true });
}

/* ---------------- reveal + ruler bridge ------------------------------ */

function setReveal(selector, on) { if (selector) postToFrame({ type: 'reveal', selector, on }); }
// "Ruler wrap": four of our guides (two per axis) snapped to the element's edges, tagged with the
// selector so they move together, follow the element, and go away when the wrap is turned off
function setRuler(selector, on) {
  if (!selector) return;
  if (on) { state.activeRulers.add(selector); state.wrapPending = selector; } else { state.activeRulers.delete(selector); wrapGuides(selector, null); }
  postToFrame({ type: 'ruler', selector, on });   // on: the frame answers with rulerRect
}
// each wrap guide remembers its edge; a re-measure moves the survivors and never resurrects one
// the user deleted or dragged away. rect = null removes the set.
function wrapGuides(selector, rect, { create = false } = {}) {
  const edges = rect ? { top: ['y', rect.y], bottom: ['y', rect.y + rect.height], left: ['x', rect.x], right: ['x', rect.x + rect.width] } : {};
  const mine = state.guides.filter((g) => g.for === selector);
  if (!rect) state.guides = state.guides.filter((g) => g.for !== selector);
  else if (create || !mine.length) {
    state.guides = state.guides.filter((g) => g.for !== selector);
    Object.entries(edges).forEach(([edge, [axis, pos]]) => state.guides.push({ id: uid('g'), axis, pos: Math.round(pos), for: selector, edge }));
  } else mine.forEach((g) => { const e = edges[g.edge]; if (e) g.pos = Math.round(e[1]); });
  saveGuides(); renderGuides();
}
// a wrap guide that's deleted or dragged leaves the set; when none are left the wrap is over
function detachGuide(gd) {
  if (!gd.for) return;
  const selector = gd.for; delete gd.for; delete gd.edge;
  if (!state.guides.some((g) => g.for === selector)) { state.activeRulers.delete(selector); postToFrame({ type: 'ruler', selector, on: false }); const t = findTargetBySelector(selector); if (t && t.ruler) { t.ruler = false; save(); } }
}
// Ruler wrap always (re)snaps four guides to the element; the guides themselves are how you remove them
function wrapSelected() {
  const sel = state.selected; if (!sel || !sel.anchor.selector) return;
  setRuler(sel.anchor.selector, true);
  const t = findTargetBySelector(sel.anchor.selector); if (t) { t.ruler = true; save(); }
}

/* ---------------- draggable modals ----------------------------------- */

const modalEls = {};
function openModal(id, { reveal = true, focusLast = false } = {}) {
  const t = state.targets.find((x) => x.id === id); if (!t) return;
  t.modal.open = true; if (reveal) setReveal(t.anchor.selector, true);
  renderModals();
  const node = modalEls[id];
  if (node) { node.style.zIndex = String(++state.modalZ); if (focusLast) { const tas = node.querySelectorAll('textarea'); const last = tas[tas.length - 1]; if (last) last.focus(); } }
}
function closeModal(id) {
  const t = state.targets.find((x) => x.id === id); if (!t) return;
  t.modal.open = false; setReveal(t.anchor.selector, false);
  if (modalEls[id]) { const n = modalEls[id]; delete modalEls[id]; n.classList.add('pt-closing'); setTimeout(() => n.remove(), 200); }
  t.notes = t.notes.filter((n) => !n._draft);                                   // closing discards unsaved drafts
  if (!t.notes.length) { if (t.ruler) setRuler(t.anchor.selector, false); state.targets = state.targets.filter((x) => x.id !== id); }
  persist();
}
function removeNote(t, note) {
  t.notes = t.notes.filter((n) => n.id !== note.id);
  if (!t.notes.length) { if (t.ruler) setRuler(t.anchor.selector, false); state.targets = state.targets.filter((x) => x.id !== t.id); closeModal(t.id); }
  persist();
}
function closeAllModals() { Object.keys(modalEls).forEach((id) => { modalEls[id].remove(); delete modalEls[id]; }); }

// Clipboard API first (needs a secure context + user gesture); fall back to execCommand otherwise
function copyText(text, { silent = false } = {}) {
  const legacy = () => {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (!silent || !ok) toast(ok ? 'Copied' : 'Copy failed');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => { if (!silent) toast('Copied'); }, legacy);
  else legacy();
}
function identityBlock(t, note) {
  const e = t.element || {};
  if (e.tag === 'multi') {
    return [
      note.text ? note.text + '\n' : null,
      `elements (${(e.members || []).length}):`,
      ...(e.members || []).map((m, i) => `  ${i + 1}. ${m.name} <${m.tag}>${m.selector ? ' ' + m.selector : ''}`),
      `page: ${state.pageKey}`
    ].filter(Boolean).join('\n');
  }
  if (e.tag === 'guide') {
    const sn = e.snap;
    return [
      note.text ? note.text + '\n' : null,
      `guide: ${e.axis === 'y' ? 'horizontal' : 'vertical'} at ${e.axis}=${e.pos}px (stage viewport px, stage ${state.w}×${state.h})`,
      e.gap ? `measures: ${e.gap.size}px between ${e.gap.axis === 'y' ? 'horizontal guides y=' : 'vertical guides x='}${e.gap.from} and ${e.gap.to}` : null,
      sn && sn.selector ? `snapped to: ${sn.edge} edge of ${sn.selector}` : e.for ? `wrapped around: ${e.for}` : null,
      `page: ${state.pageKey}`
    ].filter(Boolean).join('\n');
  }
  if (e.tag === 'region') {
    const g = e.region || {};
    return [
      note.text ? note.text + '\n' : null,
      e.gap ? `space: ${e.gap.size}px between ${e.gap.axis === 'y' ? 'horizontal guides y=' : 'vertical guides x='}${e.gap.from} and ${e.gap.to} (measured at ${e.gap.axis === 'y' ? 'x' : 'y'}=${e.gap.at})` : null,
      `area: ${Math.round(g.w)}×${Math.round(g.h)} at x=${Math.round(g.x)}, y=${Math.round(g.y)} (page px)`,
      `touches: ${(e.touching || []).map((x) => `${x.name} <${x.tag}>${x.selector ? ' ' + x.selector : ''}`).join('; ') || '(nothing)'}`,
      `page: ${state.pageKey}`
    ].filter(Boolean).join('\n');
  }
  return [
    note.text ? note.text + '\n' : null,
    `element: ${e.name || ''}`,
    `components: ${e.components && e.components.length ? e.components.join(' › ') : '(none)'}`,
    `selector: ${(e.selectors && e.selectors[0]) || '(none)'}`,
    e.id ? `id: #${e.id}` : null,
    e.attrs && e.attrs['data-testid'] ? `data-testid: ${e.attrs['data-testid']}` : null,
    `size: ${Math.round((e.rect || {}).width)}×${Math.round((e.rect || {}).height)}  z-index: ${e.zIndex || 'auto'}`,
    `page: ${state.pageKey}`
  ].filter(Boolean).join('\n');
}

// every saved note on the page as one paste-ready block (for an assistant, a ticket, a message)
function allNotesText() {
  const targets = docForSave().targets;
  const total = targets.reduce((a, t) => a + t.notes.length, 0);
  if (!total) return '';
  const lines = [`Infospector notes — ${state.pageKey} (${total} note${total === 1 ? '' : 's'}, ${state.w}×${state.h})`, ''];
  let n = 0;
  targets.forEach((t) => t.notes.forEach((note) => {
    n++;
    const body = identityBlock(t, note).split('\n');
    lines.push(`${n}. [${note.state}] ${body[0]}`);
    body.slice(1).forEach((l) => { if (l.trim()) lines.push('   ' + l); });
    lines.push('');
  }));
  return lines.join('\n').trim();
}

function renderModals() {
  Object.keys(modalEls).forEach((id) => { const t = state.targets.find((x) => x.id === id); if (!t || !t.modal.open) { modalEls[id].remove(); delete modalEls[id]; } });
  state.targets.forEach((t) => {
    if (!t.modal.open) return;
    let node = modalEls[t.id];
    if (!node) {
      node = document.createElement('div'); node.className = 'pt-modal'; node.dataset.target = t.id;
      const x = t.modal.x != null ? t.modal.x : Math.max(12, window.innerWidth - 344 - (state.modalCount % 5) * 24);
      const y = t.modal.y != null ? t.modal.y : (96 + (state.modalCount % 6) * 26);
      state.modalCount++;
      node.style.left = x + 'px'; node.style.top = y + 'px'; node.style.zIndex = String(++state.modalZ);
      modalEls[t.id] = node; el.modals.appendChild(node); makeDraggable(node, t);
    }
    paintModal(node, t);
  });
}
function paintModal(node, t) {
  node.innerHTML = '';
  const head = document.createElement('div'); head.className = 'pt-modal-head';
  const dot = document.createElement('span'); dot.className = 'pt-dot-state'; dot.style.background = STATE_COLORS[aggState(t)];
  const title = document.createElement('span'); title.className = 'pt-mh-title'; title.textContent = (t.element && t.element.name) || 'element';
  const focusBtn = document.createElement('button'); focusBtn.className = 'pt-mh-btn'; focusBtn.dataset.tip = 'Locate on page'; focusBtn.textContent = '◎';
  focusBtn.addEventListener('click', () => { if (t.anchor.guide) { selectGuide(t.anchor.guide.id); return; } setReveal(t.anchor.selector, true); postToFrame({ type: 'focusPin', id: t.id }); });
  const closeBtn = document.createElement('button'); closeBtn.className = 'pt-mh-btn'; closeBtn.dataset.tip = 'Close (discards unsaved drafts)'; closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => closeModal(t.id));
  head.appendChild(dot); head.appendChild(title); head.appendChild(focusBtn); head.appendChild(closeBtn); node.appendChild(head);

  const meta = document.createElement('div'); meta.className = 'pt-modal-meta';
  meta.textContent = t.element && t.element.tag === 'guide' ? (t.element.gap ? `${t.element.gap.size}px between guides ${t.element.gap.from} → ${t.element.gap.to}` : t.element.snap && t.element.snap.selector ? `snapped to ${t.element.snap.edge} of ${t.element.snap.selector}` : 'guide')
    : t.element && t.element.tag === 'region' ? `touches: ${(t.element.touching || []).map((x) => x.name).join(', ') || '—'}`
    : t.element && t.element.tag === 'multi' ? (t.element.members || []).map((x) => x.name).join(', ')
    : ((t.element && t.element.selectors && t.element.selectors[0]) || '');
  node.appendChild(meta);

  const body = document.createElement('div'); body.className = 'pt-modal-body';
  t.notes.forEach((note) => body.appendChild(renderNote(t, note))); node.appendChild(body);

  const foot = document.createElement('div'); foot.className = 'pt-modal-foot';
  const addBtn = document.createElement('button'); addBtn.className = 'pt-foot-btn'; addBtn.textContent = '+ Add Another Note';
  addBtn.addEventListener('click', () => { const now = new Date().toISOString(); t.notes.push({ id: uid('n'), text: '', state: 'open', createdAt: now, updatedAt: now, _draft: true }); persist(); openModal(t.id, { reveal: false, focusLast: true }); });
  foot.appendChild(addBtn); node.appendChild(foot);
}
// A note is a draft until saved; edits to a saved note are held in `_pending` until Save/Cancel,
// so nothing is written behind the user's back and a repaint never loses typing.
function renderNote(t, note) {
  const wrap = document.createElement('div'); wrap.className = 'pt-mnote pt-state-' + note.state; wrap.dataset.note = note.id;
  const dirty = () => note._draft || note._pending !== undefined;
  const paintDirty = () => { wrap.classList.toggle('pt-dirty', dirty()); saveBtn.disabled = !(ta.value.trim()); };

  const ta = document.createElement('textarea'); ta.value = note._pending !== undefined ? note._pending : note.text; ta.placeholder = 'Describe the change…';
  ta.addEventListener('input', () => { if (ta.value !== note.text || note._draft) note._pending = ta.value; else delete note._pending; paintDirty(); });
  ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doSave(); } else if (e.key === 'Escape') { e.preventDefault(); doCancel(); } });
  wrap.appendChild(ta);

  const actions = document.createElement('div'); actions.className = 'pt-mnote-actions';
  const btn = (label, cls, on, icon) => { const b = document.createElement('button'); b.className = 'pt-mini ' + cls; b.innerHTML = (icon ? icon : '') + '<span>' + label + '</span>'; b.addEventListener('click', on); return b; };

  const doSave = () => { const text = ta.value.trim(); if (!text) return; note.text = text; delete note._pending; delete note._draft; note.updatedAt = new Date().toISOString(); persist(); toast('Note saved'); };
  const doCancel = () => { if (note._draft) { removeNote(t, note); return; } delete note._pending; ta.value = note.text; paintDirty(); };
  const saveBtn = btn('Save', 'pt-primary pt-edit-only', doSave);
  const cancelBtn = btn('Cancel', 'pt-edit-only', doCancel);
  actions.appendChild(saveBtn); actions.appendChild(cancelBtn);

  const chip = document.createElement('span'); chip.className = 'pt-state-chip pt-saved-only pt-state-' + note.state; chip.textContent = note.state; chip.dataset.tip = 'Set by the assistant as it works (open → noted → done)';
  actions.appendChild(chip);
  actions.appendChild(btn('Copy', 'pt-saved-only', () => copyText(identityBlock(t, note)), ICONS.copy));
  actions.appendChild(btn('Delete', 'pt-danger pt-saved-only', () => removeNote(t, note), ICONS.trash));

  wrap.appendChild(actions);
  paintDirty();
  return wrap;
}
function makeDraggable(node, t) {
  node.addEventListener('pointerdown', () => { node.style.zIndex = String(++state.modalZ); }, true);
  node.addEventListener('pointerdown', (e) => {
    const head = e.target.closest('.pt-modal-head'); if (!head || e.target.closest('.pt-mh-btn')) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY, ox = node.offsetLeft, oy = node.offsetTop;
    try { head.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const move = (ev) => { node.style.left = Math.max(0, ox + (ev.clientX - startX)) + 'px'; node.style.top = Math.max(0, oy + (ev.clientY - startY)) + 'px'; };
    const up = () => { try { head.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); t.modal.x = node.offsetLeft; t.modal.y = node.offsetTop; save(); };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
  });
}

/* ---------------- rulers & guides ------------------------------------ */

const RULER_PX = 20;
const GUIDES_KEY = (k) => 'pt:guides:' + k;

function setRulers(on) {
  if (state.rulers === on) return;
  state.rulers = on;
  el.stage.classList.toggle('pt-rulers-on', on);
  el.stagewrap.classList.toggle('pt-rulers-pad', on);   // fit() reads the padding, so the stage re-fits
  if (!on) selectGuide(null);
  requestAnimationFrame(fit);   // re-applies the squared corners + redraws
}


function drawRulers() {
  if (!state.rulers) return;
  const s = state.scale, dpr = window.devicePixelRatio || 1;
  const W = Math.round(state.w * s), H = Math.round(state.h * s);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--pt-ruler-ink').trim() || '#fff';   // white on dark, black on light
  const { minor, major } = tickSteps(s);
  const setup = (c, w, h) => { c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1; g.font = '600 9px ' + getComputedStyle(document.body).fontFamily; return g; };
  // top ruler: x axis
  let g = setup(el.rulerTop, W, RULER_PX);
  g.textAlign = 'left'; g.textBaseline = 'top';
  for (let x = 0; x <= state.w; x += minor) {
    const sx = Math.round(x * s) + 0.5;
    const isMajor = x % major === 0, isMid = !isMajor && x % (major / 2) === 0;
    const len = isMajor ? 11 : isMid ? 7 : 4;
    g.beginPath(); g.moveTo(sx, RULER_PX); g.lineTo(sx, RULER_PX - len); g.stroke();
    if (isMajor) g.fillText(String(x), sx + 3, 2);
  }
  // left ruler: y axis (labels rotated to read upward)
  g = setup(el.rulerLeft, RULER_PX, H);
  for (let y = 0; y <= state.h; y += minor) {
    const sy = Math.round(y * s) + 0.5;
    const isMajor = y % major === 0, isMid = !isMajor && y % (major / 2) === 0;
    const len = isMajor ? 11 : isMid ? 7 : 4;
    g.beginPath(); g.moveTo(RULER_PX, sy); g.lineTo(RULER_PX - len, sy); g.stroke();
    if (isMajor) { g.save(); g.translate(2, sy + 3); g.rotate(-Math.PI / 2); g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText(String(y), 0, 0); g.restore(); }
  }
}

// ---- guides ----
function loadGuides() { try { const a = JSON.parse(localStorage.getItem(GUIDES_KEY(state.pageKey)) || '[]'); state.guides = Array.isArray(a) ? a : []; } catch (e) { state.guides = []; } state.selectedGuide = null; renderGuides(); }
function saveGuides() { try { localStorage.setItem(GUIDES_KEY(state.pageKey), JSON.stringify(state.guides)); } catch (e) { /* ignore */ } }

function findTargetByGuide(id) { return state.targets.find((t) => t.anchor && t.anchor.guide && t.anchor.guide.id === id) || null; }
function guideName(gd) { return (gd.axis === 'y' ? 'Horizontal' : 'Vertical') + ' guide at ' + (gd.axis === 'y' ? 'y' : 'x') + '=' + Math.round(gd.pos); }
function renderGuides() {
  el.guides.innerHTML = '';
  state.guides.forEach((gd) => {
    const n = document.createElement('div'); n.className = 'pt-guide pt-' + gd.axis; n.dataset.id = gd.id;
    const label = document.createElement('span'); label.className = 'pt-guide-label'; n.appendChild(label);
    const t = findTargetByGuide(gd.id);
    if (t && t.notes.length) {   // note marker on the guide, colored by its least-finished note
      const pin = document.createElement('span'); pin.className = 'pt-guide-pin'; const c = STATE_COLORS[aggState(t)];
      pin.style.background = c; pin.style.color = lumOf(c) > 0.5 ? '#111' : '#fff'; pin.textContent = String(t.notes.length); pin.dataset.tip = t.notes.length + (t.notes.length === 1 ? ' note' : ' notes') + ' on this guide';
      pin.addEventListener('pointerdown', (e) => e.stopPropagation()); pin.addEventListener('click', (e) => { e.stopPropagation(); openModal(t.id, { reveal: false }); });
      n.appendChild(pin);
    }
    n.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); selectGuide(gd.id); dragGuide(gd, e, n); });
    el.guides.appendChild(n);
  });
  positionGuides();
}
function positionGuides() {
  const s = state.scale;
  el.guides.querySelectorAll('.pt-guide').forEach((n) => {
    const gd = state.guides.find((x) => x.id === n.dataset.id); if (!gd) return;
    const px = Math.round(gd.pos * s);
    if (gd.axis === 'y') n.style.top = px + 'px'; else n.style.left = px + 'px';
    n.classList.toggle('pt-selected', gd.id === state.selectedGuide);
    n.classList.toggle('pt-snapped', !!gd.snap);
    n.querySelector('.pt-guide-label').textContent = Math.round(gd.pos) + (gd.gap ? ' · ' + gd.gap.size + 'px' : '');
  });
  placeGbox();
}
function selectGuide(id) { state.selectedGuide = id; if (id && document.activeElement === el.frame) el.frame.blur(); positionGuides(); }   // keys (Delete) must reach the host, not the page
// the purple menu next to the selected guide's label
function placeGbox() {
  const box = $('pt-gbox'); const gd = state.guides.find((g) => g.id === state.selectedGuide);
  if (!gd || !state.rulers) { box.hidden = true; return; }
  box.hidden = false;
  const vr = el.viewport.getBoundingClientRect(), s = state.scale, bw = box.offsetWidth, bh = box.offsetHeight;
  let x, y;
  if (gd.axis === 'y') { x = vr.left + 24; y = vr.top + gd.pos * s + 8; } else { x = vr.left + gd.pos * s + 8; y = vr.top + 24; }
  x = Math.max(8, Math.min(x, window.innerWidth - bw - 8)); y = Math.max(8, Math.min(y, window.innerHeight - bh - 8));
  box.style.left = x + 'px'; box.style.top = y + 'px';
}
async function deleteGuide(id) {
  const t = findTargetByGuide(id);
  if (t && t.notes.filter((x) => !x._draft).length) { const ok = await askConfirm(`Delete this guide and its ${t.notes.length} note${t.notes.length === 1 ? '' : 's'}?`); if (!ok) return; }
  if (t) { closeModal(t.id); state.targets = state.targets.filter((x) => x.id !== t.id); persist(); }
  const gd = state.guides.find((g) => g.id === id); if (gd) detachGuide(gd);
  state.guides = state.guides.filter((g) => g.id !== id); if (state.selectedGuide === id) state.selectedGuide = null; saveGuides(); renderGuides();
}
async function deleteAllGuides() {
  if (!state.guides.length) return;
  const noted = state.targets.filter((t) => t.anchor && t.anchor.guide && t.notes.some((x) => !x._draft));
  const ok = await askConfirm(noted.length ? `Delete all ${state.guides.length} guides and the notes on ${noted.length} of them?` : `Delete all ${state.guides.length} guides?`);
  if (!ok) return;
  noted.forEach((t) => closeModal(t.id));
  state.targets = state.targets.filter((t) => !(t.anchor && t.anchor.guide)); state.activeRulers.clear(); persist();
  state.guides = []; state.selectedGuide = null; saveGuides(); renderGuides();
}
// ---- notes on a guide, and on the space between two guides ----
function addNoteToGuide(id) {
  const gd = state.guides.find((g) => g.id === id); if (!gd) return;
  let t = findTargetByGuide(id); const now = new Date().toISOString();
  if (!t) {
    const element = { tag: 'guide', name: gd.gap ? `${gd.gap.size}px space` : guideName(gd), axis: gd.axis, pos: Math.round(gd.pos), snap: gd.snap || null, for: gd.for || null, gap: gd.gap || null,
      rect: gd.axis === 'y' ? { x: 0, y: gd.pos, width: state.w, height: 1 } : { x: gd.pos, y: 0, width: 1, height: state.h }, selectors: [], components: [], attrs: {} };
    t = { id: uid('t'), createdAt: now, updatedAt: now, anchor: { guide: { id: gd.id, axis: gd.axis, pos: Math.round(gd.pos) } }, element, ruler: false, modal: { x: null, y: null, open: true }, notes: [] };
    state.targets.push(t);
  } else t.modal.open = true;
  t.notes.push({ id: uid('n'), text: '', state: 'open', createdAt: now, updatedAt: now, _draft: true });
  persist(); openModal(t.id, { reveal: false, focusLast: true });
}
function addNoteToGap(gap) {   // gap: { axis, from, to, at }  — the readout's measuring line becomes a guide that carries the note
  const cross = gap.axis === 'y' ? 'x' : 'y';
  const gd = { id: uid('g'), axis: cross, pos: Math.round(gap.at), gap: { axis: gap.axis, from: gap.from, to: gap.to, size: gap.to - gap.from } };
  state.guides.push(gd); saveGuides(); renderGuides(); selectGuide(gd.id);
  addNoteToGuide(gd.id);
}
// ---- ⌘-hover readouts: distance between the guides around the pointer; click to note that space ----
function showGaps(x, y, mod) {
  el.gaps.innerHTML = '';
  if (!mod || x < 0 || !state.rulers) return;
  const s = state.scale;
  const pair = (axis, at) => { const ps = state.guides.filter((g) => g.axis === axis).map((g) => g.pos).sort((a, b) => a - b); let from = null, to = null; ps.forEach((p) => { if (p <= at) from = p; if (p >= at && to === null) to = p; }); return from !== null && to !== null && to > from ? { from, to } : null; };
  const py = pair('y', y), px = pair('x', x);
  const tag = (axis, pr, cross) => {
    const size = pr.to - pr.from, mid = (pr.from + pr.to) / 2;
    const line = document.createElement('div'); line.className = 'pt-gap-line';
    if (axis === 'y') { line.style.left = Math.round(x * s) + 'px'; line.style.top = Math.round(pr.from * s) + 'px'; line.style.width = '1px'; line.style.height = Math.round(size * s) + 'px'; }
    else { line.style.top = Math.round(y * s) + 'px'; line.style.left = Math.round(pr.from * s) + 'px'; line.style.height = '1px'; line.style.width = Math.round(size * s) + 'px'; }
    const t = document.createElement('button'); t.className = 'pt-gap'; t.textContent = size + 'px'; t.dataset.tip = 'Leave a note on this space';
    t.style.left = Math.round((axis === 'y' ? x : mid) * s) + 'px'; t.style.top = Math.round((axis === 'y' ? mid : y) * s) + 'px';
    const gap = { axis, from: pr.from, to: pr.to, at: Math.round(axis === 'y' ? x : y), cross };
    t.addEventListener('pointerdown', (e) => e.stopPropagation());
    t.addEventListener('click', (e) => { e.stopPropagation(); addNoteToGap(gap); el.gaps.innerHTML = ''; });
    el.gaps.appendChild(line); el.gaps.appendChild(t);
  };
  if (py) tag('y', py, px);
  if (px) tag('x', px, py);
}

// pointer → logical stage coordinate along the guide's axis
function guidePos(axis, e) {
  const r = el.viewport.getBoundingClientRect();
  return axis === 'y' ? (e.clientY - r.top) / state.scale : (e.clientX - r.left) / state.scale;
}
// shared drag loop: releasing over the ruler (pos < 0) discards the guide
function dragGuide(gd, e, node) {
  const capture = node || el.stage;
  try { capture.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const limit = gd.axis === 'y' ? state.h : state.w;
  postToFrame({ type: 'snapLines' });   // fresh element edges for snapping (the frame answers async)
  const move = (ev) => {
    let pos = Math.min(limit, Math.round(guidePos(gd.axis, ev)));
    // snap to element edges (and other guides) within 6 screen px
    const tol = 6 / state.scale; let best = null;
    ((state.snap && state.snap[gd.axis]) || []).forEach((ln) => { const d = Math.abs(ln.pos - pos); if (d <= tol && (!best || d < best.d)) best = { d, pos: ln.pos, snap: { selector: ln.selector, edge: ln.edge } }; });
    state.guides.forEach((o) => { if (o.id === gd.id || o.axis !== gd.axis) return; const d = Math.abs(o.pos - pos); if (d <= tol && (!best || d < best.d)) best = { d, pos: o.pos, snap: { guide: o.id } }; });
    if (best) { pos = best.pos; gd.snap = best.snap; } else gd.snap = null;
    gd.pos = pos; detachGuide(gd);   // a hand-moved guide no longer belongs to a wrap
    positionGuides();
  };
  const up = (ev) => {
    try { capture.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    capture.removeEventListener('pointermove', move); capture.removeEventListener('pointerup', up);
    if (gd.pos < 0) deleteGuide(gd.id); else { gd.pos = Math.max(0, gd.pos); saveGuides(); positionGuides(); }
  };
  capture.addEventListener('pointermove', move); capture.addEventListener('pointerup', up);
}
// drag out of a ruler: create the guide at the pointer and hand it to the drag loop
function startGuideFromRuler(axis, e) {
  e.preventDefault();
  const gd = { id: uid('g'), axis, pos: Math.round(guidePos(axis, e)) };
  state.guides.push(gd);
  renderGuides();
  selectGuide(gd.id);
  dragGuide(gd, e, el.guides.querySelector(`[data-id="${gd.id}"]`));
}

/* ---------------- background pattern --------------------------------- */

const BG_KEY = 'pt:bg', DEFAULTS_KEY = 'pt:defaults';
const BG_BASE = { pattern: 'dots', opacity: 50, patternColor: null, groundColor: null, patternTheme: null, groundTheme: null, accent: null };
const GLASS_BASE = { blur: null, sat: null, light: null, dark: null, tint: null, color: null, colorTheme: null, backing: null };
// UI ink by formula, not by theme: estimate the glass surface (ground ← tint at its opacity ←
// backing) and take whichever of black/white contrasts more with it (WCAG). Labels and section
// headers are that ink at 90%, faint text at 65%.
function updateUiInk(tintCss, backing, tintPct) {
  const cs = getComputedStyle(document.documentElement), root = document.documentElement.style;
  const ground = cs.getPropertyValue('--pt-ground').trim() || '#0b0c10';
  const surface = mixCss(mixCss(ground, tintCss, tintPct), tintCss, backing);
  const white = contrast('#ffffff', surface) >= contrast('#000000', surface);
  const ink = (a) => white ? `rgba(255, 255, 255, ${a})` : `rgba(0, 0, 0, ${a})`;
  root.setProperty('--pt-text', ink(1));
  root.setProperty('--pt-text-dim', ink(0.9));
  root.setProperty('--pt-text-faint', ink(0.65));
}
// user defaults: config.js (window.INFOSPECTOR_DEFAULTS) overridden by "Save as defaults" in this browser
function userDefaults() {
  const cfg = (typeof window.INFOSPECTOR_DEFAULTS === 'object' && window.INFOSPECTOR_DEFAULTS) || {};
  let mine = {}; try { mine = JSON.parse(localStorage.getItem(DEFAULTS_KEY) || '{}') || {}; } catch (e) { /* ignore */ }
  return { glass: Object.assign({}, GLASS_BASE, cfg.glass || {}, mine.glass || {}), bg: Object.assign({}, BG_BASE, cfg.bg || {}, mine.bg || {}) };
}
// Reset = the shipped look (base recipe + config.js), not whatever was last "Saved as defaults";
// the browser-saved defaults are cleared too so the old look doesn't return on the next boot
function resetToDefaults() {
  try { localStorage.removeItem(DEFAULTS_KEY); } catch (e) { /* ignore */ }
  const d = userDefaults(); state.glass = d.glass; state.bg = d.bg; applyGlass(); applyBg(); toast('Reset to defaults');
}
function saveAsDefaults() { try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ glass: state.glass, bg: state.bg })); toast('Saved as your defaults'); } catch (e) { toast('Could not save'); } }
const HOME_KEY = 'pt:home', BRIDGE_KEY = 'pt:bridge', SETUP_KEY = 'pt:setup';
const savedHome = () => { try { return localStorage.getItem(HOME_KEY) || ''; } catch (e) { return ''; } };
const savedBridge = () => { try { return localStorage.getItem(BRIDGE_KEY) || ''; } catch (e) { return ''; } };
function configSnippet() {
  const lines = [];
  const home = savedHome() || (typeof window.INFOSPECTOR_HOME === 'string' ? window.INFOSPECTOR_HOME : '');
  const bridge = savedBridge() || (typeof window.INFOSPECTOR_BRIDGE === 'string' ? window.INFOSPECTOR_BRIDGE : '');
  if (home) lines.push('window.INFOSPECTOR_HOME = ' + JSON.stringify(home) + ';');
  if (bridge) lines.push('window.INFOSPECTOR_BRIDGE = ' + JSON.stringify(bridge) + ';');
  lines.push('window.INFOSPECTOR_DEFAULTS = ' + JSON.stringify({ glass: state.glass, bg: state.bg }, null, 2) + ';');
  return lines.join('\n');
}

/* ---------------- first-run setup + doctor --------------------------- */

function segPick(seg, value) {
  const btns = [...seg.querySelectorAll('button')]; const i = Math.max(0, btns.findIndex((b) => b.dataset.v === value));
  btns.forEach((b, k) => b.setAttribute('aria-checked', String(k === i)));
  seg.style.setProperty('--i', i);
}
function openSetup() {
  const box = $('pt-setup'); box.hidden = false;
  const home = $('pt-setup-home'); home.value = savedHome() || (typeof window.INFOSPECTOR_HOME === 'string' && window.INFOSPECTOR_HOME) || '/';
  segPick($('pt-setup-theme'), currentTheme());
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--pt-accent').trim();
  $('pt-setup-accent').value = toHex(acc); $('pt-setup-accent-txt').value = formatColor(acc, colorFmt());
  const bridge = savedBridge() || (typeof window.INFOSPECTOR_BRIDGE === 'string' ? window.INFOSPECTOR_BRIDGE : '');
  segPick($('pt-setup-store'), bridge ? 'bridge' : 'local'); $('pt-setup-bridge').value = bridge; showBridgeRow(!!bridge);
  setTimeout(() => home.focus(), 50);
}
function showBridgeRow(on) { $('pt-setup-bridge-row').hidden = !on; $('pt-setup-bridge-note').hidden = !on; if (on && !$('pt-setup-bridge').value) $('pt-setup-bridge').value = 'http://localhost:7331'; }
function closeSetup() { $('pt-setup').hidden = true; try { localStorage.setItem(SETUP_KEY, '1'); } catch (e) { /* ignore */ } }
async function applySetup() {
  const home = $('pt-setup-home').value.trim();
  try { if (home) localStorage.setItem(HOME_KEY, home); else localStorage.removeItem(HOME_KEY); } catch (e) { /* ignore */ }
  const theme = $('pt-setup-theme').querySelector('[aria-checked="true"]').dataset.v; if (theme !== currentTheme()) setTheme(theme);
  const acc = parseColor($('pt-setup-accent-txt').value) || $('pt-setup-accent').value; state.bg.accent = acc; applyBg();
  const useBridge = $('pt-setup-store').querySelector('[aria-checked="true"]').dataset.v === 'bridge';
  const bridge = useBridge ? $('pt-setup-bridge').value.trim() : '';
  try { if (bridge) localStorage.setItem(BRIDGE_KEY, bridge); else localStorage.removeItem(BRIDGE_KEY); } catch (e) { /* ignore */ }
  window.INFOSPECTOR_BRIDGE = bridge || undefined;
  state.store = await resolveStore();
  if (bridge && window.__infospector.store() !== 'file bridge') toast('Bridge not reachable — notes stay in this browser for now');
  await switchPage(state.url);
  closeSetup();
  if (home && shortUrl(state.url) !== home && !getHistory().length) loadTarget(home);
  toast('Ready');
}
async function runDoctor() {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });   // status: ok | warn | fail
  const served = /^https?:$/.test(location.protocol);
  add('Served over http(s)', served ? 'ok' : 'fail', served ? location.origin : 'Opened from disk (file://) — the inspector needs a web server');
  let same = false; try { same = new URL(state.url).origin === location.origin; } catch (e) { /* not a url */ }
  add('Page is same-origin', same ? 'ok' : 'warn', same ? shortUrl(state.url) : 'Cross-origin pages are view-only (no inspector, no notes)');
  const loaded = state.frameMode === 'full', blocked = state.frameMode === 'blocked';
  add('Page loads in the stage', loaded ? 'ok' : blocked ? 'fail' : 'warn', loaded ? 'Loaded' : blocked ? 'Refused to be framed — allow frame-ancestors \'self\' / X-Frame-Options SAMEORIGIN' : 'Still loading or view-only');
  let injected = false; try { injected = !!el.frame.contentWindow.__ptInspector; } catch (e) { /* cross-origin */ }
  add('Inspector injected', injected ? 'ok' : 'warn', injected ? 'inspector.js is running inside the page' : 'Not running (cross-origin page, or a CSP blocking script-src \'self\')');
  if (same) {
    try {
      const r = await fetch(state.url, { method: 'HEAD', cache: 'no-store' });
      const xfo = r.headers.get('x-frame-options') || '', csp = r.headers.get('content-security-policy') || '';
      const fa = (csp.match(/frame-ancestors([^;]*)/i) || [])[1] || '';
      const bad = /deny/i.test(xfo) || /'none'/.test(fa);
      add('Frame headers', bad ? 'fail' : 'ok', bad ? `Blocks framing: ${xfo ? 'X-Frame-Options: ' + xfo : ''} ${fa ? 'frame-ancestors' + fa : ''}`.trim() : (xfo || fa ? `${xfo ? 'X-Frame-Options: ' + xfo : ''} ${fa ? 'frame-ancestors' + fa : ''}`.trim() : 'No framing restrictions'));
    } catch (e) { add('Frame headers', 'warn', 'Could not read headers'); }
  }
  add('config.js', typeof window.INFOSPECTOR_DEFAULTS === 'object' ? 'ok' : 'warn', typeof window.INFOSPECTOR_DEFAULTS === 'object' ? 'Loaded' : 'Not loaded (optional)');
  add('pages.json', state.pages.length ? 'ok' : 'warn', state.pages.length ? `${state.pages.length} curated pages` : 'None (optional — sitemap and links fill in)');
  add('Sitemap', (state.sitemap || []).length ? 'ok' : 'warn', (state.sitemap || []).length ? `${state.sitemap.length} pages from /sitemap.xml` : 'No sitemap found (optional)');
  const disc = Object.keys(state.discovered || {}).length; add('Links learned', disc ? 'ok' : 'warn', disc ? `${disc} pages seen on loaded pages` : 'None yet — load a page');
  const store = window.__infospector.store(); const wantBridge = !!(savedBridge() || window.INFOSPECTOR_BRIDGE);
  add('Notes storage', store === 'file bridge' ? 'ok' : wantBridge ? 'fail' : 'ok', store === 'file bridge' ? 'File bridge reachable' : wantBridge ? 'Bridge configured but not reachable — is server.mjs running?' : 'This browser (localStorage)');
  let shot = false; try { shot = (await fetch(PT_BASE + 'vendor/html-to-image.js', { method: 'HEAD' })).ok; } catch (e) { /* missing */ }
  add('Screenshots', shot ? 'ok' : 'warn', shot ? 'vendor/html-to-image.js present' : 'vendor/html-to-image.js missing — screenshot button will be disabled');
  return checks;
}
async function showDoctor() {
  const box = $('pt-doctor'), list = $('pt-doctor-list'); box.hidden = false; list.innerHTML = '<li><span class="pt-doc-detail">Checking…</span></li>';
  const checks = await runDoctor(); state.lastDoctor = checks;
  list.innerHTML = '';
  checks.forEach((c) => { const li = document.createElement('li'); li.className = 'pt-doc-' + c.status; li.innerHTML = `<span class="pt-doc-ico">${c.status === 'ok' ? '✓' : c.status === 'warn' ? '–' : '!'}</span><span><div class="pt-doc-name"></div><div class="pt-doc-detail"></div></span>`; li.querySelector('.pt-doc-name').textContent = c.name; li.querySelector('.pt-doc-detail').textContent = c.detail; list.appendChild(li); });
}
function bindSetup() {
  $('pt-setup-theme').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) segPick($('pt-setup-theme'), b.dataset.v); });
  $('pt-setup-store').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; segPick($('pt-setup-store'), b.dataset.v); showBridgeRow(b.dataset.v === 'bridge'); });
  $('pt-setup-accent').addEventListener('input', () => { $('pt-setup-accent-txt').value = formatColor($('pt-setup-accent').value, colorFmt()); });
  $('pt-setup-accent-txt').addEventListener('change', () => { const v = parseColor($('pt-setup-accent-txt').value); if (v) $('pt-setup-accent').value = toHex(v); });
  $('pt-setup-start').addEventListener('click', applySetup);
  $('pt-setup-skip').addEventListener('click', closeSetup);
  $('pt-setup-copy').addEventListener('click', () => copyText(configSnippet()));
  $('pt-doctor-again').addEventListener('click', showDoctor);
  $('pt-doctor-close').addEventListener('click', () => { $('pt-doctor').hidden = true; });
  $('pt-doctor-copy').addEventListener('click', () => copyText((state.lastDoctor || []).map((c) => `${c.status === 'ok' ? '✓' : c.status === 'warn' ? '–' : '✗'} ${c.name}: ${c.detail}`).join('\n')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('pt-doctor').hidden) $('pt-doctor').hidden = true; else if (!$('pt-setup').hidden) closeSetup(); } });
}
// slider tracks fill with the glass tint up to the thumb
function updateSliderFills() {
  document.querySelectorAll('.pt-ctx-range input[type="range"]').forEach((inp) => {
    const min = Number(inp.min) || 0, max = Number(inp.max) || 100, v = Number(inp.value);
    inp.style.setProperty('--fill', (Math.max(0, Math.min(1, (v - min) / (max - min))) * 100).toFixed(1) + '%');
  });
}
function applyBg() {
  ['dots', 'grid', 'lines', 'none'].forEach((p) => el.stagewrap.classList.toggle('pt-bg-' + p, p === state.bg.pattern));
  const root = document.documentElement.style;
  root.setProperty('--pt-pattern-opacity', String(state.bg.opacity / 100));
  // custom colors override the theme tokens inline; null falls back to the theme's default
  const th = currentTheme();
  if (state.bg.patternColor) root.setProperty('--pt-pattern', forTheme(state.bg.patternColor, state.bg.patternTheme, th)); else root.removeProperty('--pt-pattern');
  if (state.bg.groundColor) {
    const gnd = forTheme(state.bg.groundColor, state.bg.groundTheme, th);
    root.setProperty('--pt-ground', gnd);
    root.setProperty('--pt-ground-2', lumOf(gnd) > 0.4 ? mixCss(gnd, '#000000', 0.05) : mixCss(gnd, '#ffffff', 0.06));   // the top-of-page glow follows the chosen ground
  } else { root.removeProperty('--pt-ground'); root.removeProperty('--pt-ground-2'); }
  if (state.bg.accent) root.setProperty('--pt-accent', state.bg.accent); else root.removeProperty('--pt-accent');   // same in both themes: it's a highlight
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--pt-accent').trim();
  root.setProperty('--pt-accent-ink', contrast('#ffffff', acc) >= 3 ? '#ffffff' : '#111111');   // text on accent-filled controls: white when it clears 3:1 (bold button text), else near-black
  updateRulerInk();
  if (state.glass) applyGlass();   // the UI ink depends on the ground under the backing
  const order = ['dots', 'grid', 'lines', 'none'];
  el.ctx.querySelectorAll('[data-bg]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.bg === state.bg.pattern)));
  const seg = $('pt-bg-seg'), next = String(Math.max(0, order.indexOf(state.bg.pattern)));
  if (seg.style.getPropertyValue('--i') !== next) {            // squish the pill as it slides (the pen's scaleToggle)
    const ind = seg.querySelector('.pt-seg-ind');
    seg.style.setProperty('--i', next);
    ind.style.transformOrigin = Number(next) > Number(seg.dataset.prev || 0) ? 'left' : 'right';
    ind.classList.remove('pt-squish'); void ind.offsetWidth; ind.classList.add('pt-squish');
    seg.dataset.prev = next;
  }
  el.bgOpacity.value = state.bg.opacity; el.bgOpacityVal.textContent = state.bg.opacity + '%';
  syncColorInputs(); updateSliderFills();
  try { localStorage.setItem(BG_KEY, JSON.stringify(state.bg)); } catch (e) { /* ignore */ }
}
// tick ink + edge hairline follow the *effective* ground's luminance (white on dark, black on light)
function updateRulerInk() {
  const cs = getComputedStyle(document.documentElement);
  const light = lumOf(cs.getPropertyValue('--pt-ground').trim()) > 0.45, root = document.documentElement.style;   // effective (theme-adjusted) ground
  root.setProperty('--pt-ruler-ink', light ? '#14171d' : '#ffffff');
  root.setProperty('--pt-ruler-edge', light ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)');
  drawRulers();
}
function loadBg() {
  state.bg = userDefaults().bg;
  try { const b = JSON.parse(localStorage.getItem(BG_KEY) || 'null'); if (b && b.pattern) state.bg = { pattern: b.pattern, opacity: Number.isFinite(b.opacity) ? b.opacity : 50, patternColor: b.patternColor || null, groundColor: b.groundColor || null, patternTheme: b.patternTheme || null, groundTheme: b.groundTheme || null, accent: b.accent || null }; } catch (e) { /* ignore */ }
  applyBg();
}
// ---- color helpers: chips need hex; the text field takes hex / rgb() / hsl() / hsb() ----
// ---- color formats: fields display in the chosen notation; input still accepts any ----
const FMT_KEY = 'pt:colorfmt';
function colorFmt() { try { return localStorage.getItem(FMT_KEY) || 'hex'; } catch (e) { return 'hex'; } }

function syncColorInputs() {
  if (!el.colPattern) return;
  const cs = getComputedStyle(document.documentElement);
  const pat = cs.getPropertyValue('--pt-pattern').trim();   // effective (theme-adjusted) values
  const gnd = cs.getPropertyValue('--pt-ground').trim();
  const fmt = colorFmt(); if (el.colFmt) el.colFmt.value = fmt;
  el.colPattern.value = toHex(pat); el.colGround.value = toHex(gnd);
  if (document.activeElement !== el.colPatternTxt) el.colPatternTxt.value = formatColor(pat, fmt);
  if (document.activeElement !== el.colGroundTxt) el.colGroundTxt.value = formatColor(gnd, fmt);
  const acc = cs.getPropertyValue('--pt-accent').trim();
  el.colAccent.value = toHex(acc);
  if (document.activeElement !== el.colAccentTxt) el.colAccentTxt.value = formatColor(acc, fmt);
  el.colPatternTxt.classList.remove('pt-invalid'); el.colGroundTxt.classList.remove('pt-invalid'); el.colAccentTxt.classList.remove('pt-invalid');
}
/* ---------------- appearance (the glass recipe's dials) ---------------- */

const GLASS_KEY = 'pt:glass';
const GLASS_DEFAULTS = { blur: 8, sat: 150, tint: 14, color: '#bbbbbc', backing: 35 };   // light/dark reflex defaults come from the theme

function applyGlass() {
  const g = state.glass, root = document.documentElement.style;
  const set = (name, v) => (v == null ? root.removeProperty(name) : root.setProperty(name, v));
  set('--glass-blur', g.blur == null ? null : g.blur + 'px');
  set('--saturation', g.sat == null ? null : g.sat + '%');
  set('--glass-reflex-light', g.light);
  set('--glass-reflex-dark', g.dark);
  set('--glass-tint', g.tint == null ? null : g.tint + '%');
  set('--glass-tint-2', g.tint == null ? null : Math.min(100, g.tint + 22) + '%');  // controls sit ~22 points denser than surfaces
  const th = currentTheme(), tintCss = forTheme(g.color, g.colorTheme, th);
  set('--c-glass', tintCss);
  const tintFx = tintCss || getComputedStyle(document.documentElement).getPropertyValue('--c-glass').trim() || GLASS_DEFAULTS.color;
  const backing = g.backing == null ? GLASS_DEFAULTS.backing : g.backing;
  set('--glass-backing-color', tintFx);   // the backing IS the tint color, so raising it deepens the tint rather than erasing it
  set('--glass-backing', backing + '%');
  updateUiInk(tintFx, backing / 100, (g.tint == null ? GLASS_DEFAULTS.tint : g.tint) / 100);
  syncGlassInputs();
  try { localStorage.setItem(GLASS_KEY, JSON.stringify(g)); } catch (e) { /* ignore */ }
}
function loadGlass() { state.glass = userDefaults().glass; try { const g = JSON.parse(localStorage.getItem(GLASS_KEY) || 'null'); if (g && typeof g === 'object') state.glass = Object.assign({}, GLASS_BASE, g); } catch (e) { /* ignore */ } delete state.glass.refr; applyGlass(); }
function syncGlassInputs() {
  if (!el.apBlur) return;
  const cs = getComputedStyle(document.documentElement), g = state.glass;
  const num = (v, fallback) => (v == null ? fallback : v);
  const blur = num(g.blur, parseFloat(cs.getPropertyValue('--glass-blur')) || GLASS_DEFAULTS.blur);
  const sat = num(g.sat, parseFloat(cs.getPropertyValue('--saturation')) || GLASS_DEFAULTS.sat);
  const light = num(g.light, parseFloat(cs.getPropertyValue('--glass-reflex-light')));
  const dark = num(g.dark, parseFloat(cs.getPropertyValue('--glass-reflex-dark')));
  const tint = num(g.tint, parseFloat(cs.getPropertyValue('--glass-tint')) || GLASS_DEFAULTS.tint);
  const backing = num(g.backing, GLASS_DEFAULTS.backing);
  const color = cs.getPropertyValue('--c-glass').trim() || GLASS_DEFAULTS.color;   // effective (theme-adjusted)
  const put = (inp, out, v, unit) => { inp.value = v; out.textContent = (Number.isInteger(v) ? v : v.toFixed(1)) + unit; };
  put(el.apBlur, $('pt-ap-blur-val'), blur, 'px'); put(el.apSat, $('pt-ap-sat-val'), sat, '%');
  put(el.apLight, $('pt-ap-light-val'), light, '×'); put(el.apDark, $('pt-ap-dark-val'), dark, '×');
  put(el.apTint, $('pt-ap-tint-val'), tint, '%'); put(el.apBacking, $('pt-ap-backing-val'), backing, '%');
  el.apColor.value = toHex(color); if (document.activeElement !== el.apColorTxt) el.apColorTxt.value = formatColor(color, colorFmt());
  el.apColorTxt.classList.remove('pt-invalid');
  updateSliderFills();
}

/* ---------------- liquid open/close ---------------- */

// close with the out-animation; the node stays displayed until it ends (or a show cancels it)
function hidePop(node, { attr = false } = {}) {
  const shown = attr ? !node.hidden : node.classList.contains('pt-open');
  if (!shown || node.classList.contains('pt-closing')) return;
  node.classList.add('pt-closing');
  const done = () => { if (!node.classList.contains('pt-closing')) return; node.classList.remove('pt-closing'); if (attr) node.hidden = true; else node.classList.remove('pt-open'); };
  node.addEventListener('animationend', done, { once: true });
  setTimeout(done, 240);
}
function showPop(node, { attr = false } = {}) { node.classList.remove('pt-closing'); if (attr) node.hidden = false; else node.classList.add('pt-open'); }

function openCtx(x, y) {
  showPop(el.ctx, { attr: true });
  syncColorInputs(); syncGlassInputs();
  const r = el.ctx.getBoundingClientRect();
  el.ctx.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  el.ctx.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
}
function closeCtx() { hidePop(el.ctx, { attr: true }); }

function toggleInspectShortcut() { if (!el.inspect.disabled) setInspect(state.mode !== 'inspect'); }
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const SHORTCUTS = [
  [[MOD, 'K'], 'Search a page or paste a URL'],
  [['⇧', MOD, 'I'], 'Toggle Inspect (rulers come with it)'],
  [['Shift'], 'Hold to peek at hover boxes and rulers'],
  [['Shift', 'Click'], 'While peeking: turn Inspect on and select that element'],
  [['Click'], 'Select an element (in Inspect)'],
  [['⇧', MOD, 'Click'], 'Add / remove from a multi-selection'],
  [['Shift', 'Drag'], 'Select an area'],
  [['Esc'], 'Deselect · close menus'],
  [[MOD, '↩'], 'Save the note you\'re writing'],
  [['Drag'], 'Pull a guide out of a ruler (drag it back to remove)'],
  [['⌫'], 'Delete the selected guide'],
  [[MOD, 'Hover'], 'Between two guides: shows the distance — click it to note that space'],
  [['Right-click'], 'Background, colors & appearance'],
  [['?'], 'This list'],
];
function buildKeysList() {
  const dl = $('pt-keys-list'); dl.innerHTML = '';
  SHORTCUTS.forEach(([keys, what]) => { const dt = document.createElement('dt'); keys.forEach((k) => { const kb = document.createElement('kbd'); kb.className = 'pt-key'; kb.textContent = k; dt.appendChild(kb); }); const dd = document.createElement('dd'); dd.textContent = what; dl.appendChild(dt); dl.appendChild(dd); });
}
function toggleKeys() { const pop = $('pt-keys-pop'); if (pop.classList.contains('pt-open') && !pop.classList.contains('pt-closing')) hidePop(pop); else { showPop(pop); anchorPop(pop, $('pt-keys-btn'), { align: 'center', above: true }); } }
function focusSearch() { el.omni.focus(); el.omni.select(); renderResults(el.omni.value); }
function isSearchShortcut(e) { return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key || '').toLowerCase() === 'k'; }
function isInspectShortcut(e) { return (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key || '').toLowerCase() === 'i'; }

function bindRulersAndBg() {
  el.rulerTop.addEventListener('pointerdown', (e) => startGuideFromRuler('y', e));
  el.rulerLeft.addEventListener('pointerdown', (e) => startGuideFromRuler('x', e));
  document.addEventListener('keyup', (e) => { if (e.key === 'Shift') setPeek(false); });
  window.addEventListener('blur', () => setPeek(false));   // (a click into the page deselects via the frame's frameDown message)
  document.addEventListener('keydown', (e) => {
    if (isInspectShortcut(e)) { e.preventDefault(); toggleInspectShortcut(); return; }   // ⇧⌘I
    if (isSearchShortcut(e)) { e.preventDefault(); focusSearch(); return; }              // ⌘K
    if (e.key === 'Shift' && !e.repeat) setPeek(true);
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    if (e.key === '?') { e.preventDefault(); toggleKeys(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedGuide) { e.preventDefault(); deleteGuide(state.selectedGuide); }
    else if (e.key === 'Escape') { selectGuide(null); closeCtx(); if (state.selected) hideSelbox(); }   // Esc also deselects (no × in the design)
  });
  // clicking the empty background deselects; right-clicking it opens the pattern menu
  document.addEventListener('pointerdown', (e) => { const t = e.target && e.target.closest ? e.target : document.body; if (state.selectedGuide && !t.closest('.pt-guide, #pt-gbox, #pt-confirm, .pt-modal')) selectGuide(null); }, true);
  el.stagewrap.addEventListener('contextmenu', (e) => { if (e.target !== el.stagewrap) return; e.preventDefault(); openCtx(e.clientX, e.clientY); });
  document.addEventListener('pointerdown', (e) => { if (!el.ctx.hidden && !el.ctx.contains(e.target)) closeCtx(); }, true);
  const segIcons = { dots: ICONS.grip, grid: ICONS.grid3, lines: ICONS.diagonal, none: ICONS.ban };
  el.ctx.querySelectorAll('[data-bg]').forEach((b) => { b.innerHTML = segIcons[b.dataset.bg] || ''; b.addEventListener('click', () => { state.bg.pattern = b.dataset.bg; applyBg(); }); });
  el.bgOpacity.addEventListener('input', () => { state.bg.opacity = Number(el.bgOpacity.value); applyBg(); });
  // color chips (native picker) + free-text values; Reset returns to the theme defaults
  el.colPattern.addEventListener('input', () => { state.bg.patternColor = el.colPattern.value; state.bg.patternTheme = currentTheme(); applyBg(); });
  el.colGround.addEventListener('input', () => { state.bg.groundColor = el.colGround.value; state.bg.groundTheme = currentTheme(); applyBg(); });
  el.colAccent.addEventListener('input', () => { state.bg.accent = el.colAccent.value; applyBg(); });
  el.colAccentTxt.addEventListener('change', () => { const v = parseColor(el.colAccentTxt.value); if (!v) { el.colAccentTxt.classList.add('pt-invalid'); return; } state.bg.accent = v; applyBg(); });
  const bindTxt = (inp, key) => inp.addEventListener('change', () => { const v = parseColor(inp.value); if (!v) { inp.classList.add('pt-invalid'); return; } state.bg[key] = v; state.bg[key === 'patternColor' ? 'patternTheme' : 'groundTheme'] = currentTheme(); applyBg(); });
  bindTxt(el.colPatternTxt, 'patternColor'); bindTxt(el.colGroundTxt, 'groundColor');
  // Appearance sliders drive the glass recipe live
  const slide = (inp, key, parse) => inp.addEventListener('input', () => { state.glass[key] = parse(inp.value); applyGlass(); });
  slide(el.apBlur, 'blur', Number); slide(el.apSat, 'sat', Number); slide(el.apBacking, 'backing', Number); slide(el.apLight, 'light', Number); slide(el.apDark, 'dark', Number); slide(el.apTint, 'tint', Number);
  el.apColor.addEventListener('input', () => { state.glass.color = el.apColor.value; state.glass.colorTheme = currentTheme(); applyGlass(); });
  el.apColorTxt.addEventListener('change', () => { const v = parseColor(el.apColorTxt.value); if (!v) { el.apColorTxt.classList.add('pt-invalid'); return; } state.glass.color = v; state.glass.colorTheme = currentTheme(); applyGlass(); });
  el.colFmt.addEventListener('change', () => { try { localStorage.setItem(FMT_KEY, el.colFmt.value); } catch (e) { /* ignore */ } syncColorInputs(); syncGlassInputs(); });
  el.apReset.addEventListener('click', resetToDefaults);
  el.apSave.addEventListener('click', saveAsDefaults);
  el.apCopy.addEventListener('click', () => { copyText(configSnippet()); closeCtx(); });
  document.querySelectorAll('.pt-ctx-range input[type="range"]').forEach((inp) => inp.addEventListener('input', updateSliderFills));
  loadBg();
  loadGlass();
}

/* ---------------- typeahead ------------------------------------------ */

/*
 * Where the "Pages" list comes from (all optional, merged, de-duped by path):
 *   1. pages.json next to index.html            — curated: [{ title, path, type }]
 *   2. window.INFOSPECTOR_PAGES in config.js     — same shape, for projects that generate it
 *   3. /sitemap.xml (or a sitemap index)          — zero setup: most frameworks emit one
 *   4. links harvested from every page loaded on the stage (persisted) — learns as you browse
 */
const DISCOVERED_KEY = 'pt:discovered', DISCOVERED_MAX = 300;
async function loadManifest() {
  try { const res = await fetch(PT_BASE + 'pages.json', { cache: 'no-store' }); if (res.ok) { const data = await res.json(); if (Array.isArray(data)) state.pages = data; } } catch (e) { /* fine */ }
  if (Array.isArray(window.INFOSPECTOR_PAGES)) state.pages = state.pages.concat(window.INFOSPECTOR_PAGES);
  try { state.discovered = JSON.parse(localStorage.getItem(DISCOVERED_KEY) || '{}') || {}; } catch (e) { state.discovered = {}; }
  loadSitemap();   // async; results appear when they arrive
}
function rememberPages(entries) {   // entries: [{ path, title }]
  let changed = false;
  entries.forEach(({ path, title }) => { if (!path) return; const cur = state.discovered[path]; if (!cur || (title && !cur.title)) { state.discovered[path] = { title: title || cur?.title || '' }; changed = true; } });
  if (!changed) return;
  const keys = Object.keys(state.discovered); if (keys.length > DISCOVERED_MAX) keys.slice(0, keys.length - DISCOVERED_MAX).forEach((k) => delete state.discovered[k]);
  try { localStorage.setItem(DISCOVERED_KEY, JSON.stringify(state.discovered)); } catch (e) { /* ignore */ }
}
function harvestLinks(doc) {
  try {
    const seen = new Map();
    doc.querySelectorAll('a[href]').forEach((a) => { const path = pagePath(a.getAttribute('href')); if (!path || seen.has(path)) return; const t = (a.textContent || '').trim().replace(/\s+/g, ' '); seen.set(path, t.length > 1 && t.length <= 48 ? t : ''); });
    rememberPages([...seen].map(([path, title]) => ({ path, title })));
  } catch (e) { /* cross-origin or odd doc */ }
}
async function loadSitemap() {
  const fetchXml = async (url) => { try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) return null; const t = await r.text(); if (!/<(urlset|sitemapindex)/i.test(t)) return null; return new DOMParser().parseFromString(t, 'application/xml'); } catch (e) { return null; } };
  let xml = await fetchXml(location.origin + '/sitemap.xml');
  if (!xml) { try { const r = await fetch(location.origin + '/robots.txt'); const m = r.ok && (await r.text()).match(/^sitemap:\s*(\S+)/im); if (m) xml = await fetchXml(m[1]); } catch (e) { /* none */ } }
  if (!xml) return;
  let docs = [xml];
  if (xml.querySelector('sitemapindex')) docs = (await Promise.all([...xml.querySelectorAll('sitemap > loc')].slice(0, 8).map((l) => fetchXml(l.textContent.trim())))).filter(Boolean);
  const entries = [];
  docs.forEach((d) => d.querySelectorAll('url > loc').forEach((l) => { const path = pagePath(l.textContent.trim()); if (path) entries.push({ path, title: '' }); }));
  state.sitemap = entries;
}
function renderResults(q) {
  const typed = q.trim();
  const raw = typed === (state.url || '') ? '' : typed, query = raw.toLowerCase();   // the current page's own URL isn't a search
  let items = [];
  if (isUrlish(raw)) items.push({ title: 'Open URL', path: raw, type: 'url', _url: true });
  if (!isUrlish(raw)) {
    const hist = getHistory().filter((u) => !query || u.toLowerCase().includes(query)).map((u) => ({ title: shortUrl(u), path: u, type: 'recent', group: 'Recent' }));
    items = items.concat(hist);
    const pages = allPages().filter((p) => !query || p.title.toLowerCase().includes(query) || p.path.toLowerCase().includes(query)).map((p) => Object.assign({ group: 'Pages' }, p));
    items = items.concat(pages);
  }
  el.results.innerHTML = '<div class="pt-omni-hint">Copy Paste URL to Load on Stage</div>';
  showPop(el.results); anchorPop(el.results, el.omniWrap, { width: el.omniWrap.offsetWidth });
  if (!items.length) { state.activeIdx = -1; return; }
  el.results.classList.add('pt-open');
  let lastGroup = null;
  items.slice(0, 40).forEach((it) => {
    if (it.group && it.group !== lastGroup) { const g = document.createElement('div'); g.className = 'pt-omni-group'; g.textContent = it.group; el.results.appendChild(g); lastGroup = it.group; }
    const row = document.createElement('div'); row.className = 'pt-omni-item'; row.dataset.target = it.path;
    const title = document.createElement('span'); title.className = 'pt-oi-title'; title.textContent = it.title || it.path; row.appendChild(title);
    if (it.type && it.type !== 'recent') { const b = document.createElement('span'); b.className = 'pt-oi-badge'; b.textContent = it.type; row.appendChild(b); }
    const path = document.createElement('span'); path.className = 'pt-oi-path'; path.textContent = it._url ? '↵' : (it.type === 'recent' ? '' : it.path); row.appendChild(path);
    row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(it.path); });
    el.results.appendChild(row);
  });
  state.activeIdx = -1;
}
function choose(target) { loadTarget(target); hidePop(el.results); el.omni.blur(); }
function moveActive(delta) { const rows = Array.from(el.results.querySelectorAll('.pt-omni-item')); if (!rows.length) return; state.activeIdx = (state.activeIdx + delta + rows.length) % rows.length; rows.forEach((r, i) => r.classList.toggle('pt-active', i === state.activeIdx)); rows[state.activeIdx].scrollIntoView({ block: 'nearest' }); }

/* ---------------- screenshot ----------------------------------------- */

let rasterizerPromise = null;
function loadRasterizer() { if (window.htmlToImage) return Promise.resolve(window.htmlToImage); if (rasterizerPromise) return rasterizerPromise; rasterizerPromise = new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = PT_BASE + 'vendor/html-to-image.js'; s.onload = () => resolve(window.htmlToImage); s.onerror = () => reject(new Error('missing')); document.head.appendChild(s); }); return rasterizerPromise; }
async function screenshot() {
  if (state.frameMode !== 'full') { toast('Screenshots need a same-origin page (external pages are cross-origin).'); return; }
  let lib; try { lib = await loadRasterizer(); } catch (e) { toast('Add vendor/html-to-image.js to enable screenshots'); return; }
  el.shot.disabled = true;
  try {
    const doc = el.frame.contentDocument, dpr = window.devicePixelRatio || 1;
    const inspecting = state.mode === 'inspect' || state.rulers;
    let dataUrl;
    if (!inspecting) {
      dataUrl = await lib.toPng(doc.documentElement, { width: state.w, height: state.h, backgroundColor: '#ffffff', pixelRatio: dpr, cacheBust: true, style: { transform: 'none' } });
    } else {
      // inspecting: composite what's on screen — page (with its in-frame outlines/pins/marquee),
      // rulers, guides, the Item Info box and any open note modals — at the current zoom
      const s = state.scale, vr = el.viewport.getBoundingClientRect(), R = state.rulers ? RULER_PX + 1 : 0;
      // overlays first, so the canvas can grow to include any that hang outside the stage
      const overlays = [];
      if (!el.selbox.hidden) overlays.push(el.selbox);
      Object.values(modalEls).forEach((m) => overlays.push(m));
      let minX = vr.left - R, minY = vr.top - R, maxX = vr.right, maxY = vr.bottom;
      overlays.forEach((nd) => { const r = nd.getBoundingClientRect(); minX = Math.min(minX, r.left); minY = Math.min(minY, r.top); maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom); });
      const W = Math.round(maxX - minX), H = Math.round(maxY - minY);
      const ox = vr.left - minX, oy = vr.top - minY;          // where the stage's content lands on the canvas
      const out = document.createElement('canvas'); out.width = Math.round(W * dpr); out.height = Math.round(H * dpr);
      const g = out.getContext('2d'); g.scale(dpr, dpr);
      g.fillStyle = getComputedStyle(document.body).backgroundColor || '#0b0c10'; g.fillRect(0, 0, W, H);
      const page = await lib.toCanvas(doc.documentElement, { width: state.w, height: state.h, backgroundColor: '#ffffff', pixelRatio: dpr, cacheBust: true, style: { transform: 'none' } });
      g.drawImage(page, ox, oy, vr.width, vr.height);
      if (state.rulers) {
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(ox - R, oy - R, vr.width + R, RULER_PX); g.fillRect(ox - R, oy - R, RULER_PX, vr.height + R);
        g.drawImage(el.rulerTop, ox, oy - R, vr.width, RULER_PX); g.drawImage(el.rulerLeft, ox - R, oy, RULER_PX, vr.height);
      }
      const rulerColor = getComputedStyle(document.documentElement).getPropertyValue('--pt-ruler').trim() || '#e5484d';
      const selColor = getComputedStyle(document.documentElement).getPropertyValue('--pt-guide-sel').trim() || '#a259ff';
      g.lineWidth = 1;
      state.guides.forEach((gd) => {
        g.strokeStyle = gd.id === state.selectedGuide ? selColor : rulerColor; g.beginPath();
        if (gd.axis === 'y') { const y = oy + Math.round(gd.pos * s) + 0.5; g.moveTo(ox - R, y); g.lineTo(ox + vr.width, y); } else { const x = ox + Math.round(gd.pos * s) + 0.5; g.moveTo(x, oy - R); g.lineTo(x, oy + vr.height); }
        g.stroke();
      });
      for (const node of overlays) {
        try {
          const c = await lib.toCanvas(node, { pixelRatio: dpr, cacheBust: true, style: { animation: 'none', transform: 'none' } });
          const r = node.getBoundingClientRect();
          g.drawImage(c, r.left - minX, r.top - minY, r.width, r.height);
        } catch (e) { /* skip an overlay that won't rasterize */ }
      }
      dataUrl = out.toDataURL('image/png');
    }
    const a = document.createElement('a'); a.download = `infospector-${(state.pageKey || 'page').replace(/[^\w]+/g, '-')}-${state.w}x${state.h}${inspecting ? '-inspect' : ''}.png`; a.href = dataUrl; a.click();
    toast('Screenshot saved');
  } catch (e) { toast('Screenshot failed — a cross-origin image may have tainted it'); }
  finally { el.shot.disabled = false; }
}

/* ---------------- export / import / clear ---------------------------- */

function exportNotes() { const doc = docForSave(); const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.download = `notes-${(state.pageKey || 'page').replace(/[^\w]+/g, '-')}.json`; a.href = URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href); }
function importNotes(text) { try { const doc = migrate(JSON.parse(text)); if (!Array.isArray(doc.targets)) throw new Error('bad'); state.targets = doc.targets; closeAllModals(); persist(); const n = doc.targets.reduce((a, t) => a + t.notes.length, 0); toast(`Imported ${n} note${n === 1 ? '' : 's'}`); } catch (e) { toast('Invalid notes JSON'); } }

/* ---------------- robot control surface ------------------------------ */

function installRobotApi() {
  // `__previewTester` is kept as a legacy alias of `__infospector`
  window.__previewTester = window.__infospector = {
    version: 2,   // matches the notes document schema version
    states: STATES.slice(),   // 'open' | 'noted' | 'done' (old reviewed/working/complete still accepted)
    listTargets: () => JSON.parse(JSON.stringify(docForSave().targets)),
    listNotes: () => docForSave().targets.flatMap((t) => t.notes.map((n) => ({ targetId: t.id, id: n.id, text: n.text, state: n.state, element: t.element }))),
    getNote: (id) => { const f = findNote(id); return f && !f.note._draft ? JSON.parse(JSON.stringify({ targetId: f.target.id, ...f.note, element: f.target.element })) : null; },
    setNoteState: (id, s) => { s = normState(s); const f = findNote(id); if (!f || f.note._draft) return false; f.note.state = s; f.note.updatedAt = new Date().toISOString(); persist(); return true; },
    updateNote: (id, patch) => { const f = findNote(id); if (!f || f.note._draft) return false; if (typeof patch.text === 'string') f.note.text = patch.text; if (patch.state) f.note.state = normState(patch.state); f.note.updatedAt = new Date().toISOString(); persist(); return true; },
    deleteNote: (id) => { const f = findNote(id); if (!f) return false; f.target.notes = f.target.notes.filter((n) => n.id !== id); if (!f.target.notes.length) { setRuler(f.target.anchor.selector, false); state.targets = state.targets.filter((x) => x.id !== f.target.id); closeModal(f.target.id); } persist(); return true; },
    setTargetRuler: (id, on) => { const t = state.targets.find((x) => x.id === id); if (!t) return false; t.ruler = !!on; setRuler(t.anchor.selector, t.ruler); persist(); return true; },
    openTarget: (id) => openModal(id, { reveal: true }),
    doctor: runDoctor,                                  // -> Promise<[{ name, status: ok|warn|fail, detail }]>
    openSetup, openDoctor: showDoctor,
    clearAll: () => { state.targets = []; [...state.activeRulers].forEach((s) => setRuler(s, false)); closeAllModals(); persist(); return true; },
    exportJSON: () => JSON.stringify(docForSave(), null, 2),
    allNotesText: () => allNotesText(),   // the same block "Copy all notes" puts on the clipboard
    importJSON: (str) => { importNotes(str); return true; },
    pageKey: () => state.pageKey,
    store: () => (state.store ? state.store.name : null)
  };
}

/* ---------------- wiring --------------------------------------------- */

// instant tooltips for anything carrying data-tip (hover or keyboard focus)
// a short "Copied" tip above a node (the hover tips sit below)
function flashTip(node, text = 'Copied') {
  el.tip.textContent = text; el.tip.hidden = false;
  const r = node.getBoundingClientRect(), tw = el.tip.offsetWidth, th = el.tip.offsetHeight;
  el.tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 8)) + 'px';
  el.tip.style.top = Math.max(8, r.top - 8 - th) + 'px';
  clearTimeout(flashTip.t); flashTip.t = setTimeout(() => { if (el.tip.textContent === text) el.tip.hidden = true; }, 900);
}
function bindTips() {
  // Item Info: click the name, selector, size, z-index, id or components to copy that value
  el.selbox.addEventListener('click', (e) => { const n = e.target.closest('[data-copy]'); if (!n || !el.selbox.contains(n) || !n.dataset.copy) return; e.stopPropagation(); copyText(n.dataset.copy, { silent: true }); flashTip(n); });
  let cur = null;
  const show = (n) => { const text = n.dataset.tip; if (!text) return; el.tip.textContent = text; el.tip.hidden = false; const r = n.getBoundingClientRect(), tw = el.tip.offsetWidth; el.tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 8)) + 'px'; el.tip.style.top = (r.bottom + 8) + 'px'; cur = n; };
  const hide = () => { el.tip.hidden = true; cur = null; };
  const tipOf = (e) => (e.target && e.target.closest ? e.target.closest('[data-tip]') : null);
  document.addEventListener('mouseover', (e) => { const n = tipOf(e); if (n && n !== cur) show(n); else if (!n && cur) hide(); });
  document.addEventListener('mouseout', (e) => { const n = tipOf(e); if (n && !n.contains(e.relatedTarget)) hide(); });
  document.addEventListener('focusin', (e) => { const n = tipOf(e); if (n) show(n); });
  document.addEventListener('focusout', hide);
  document.addEventListener('mousedown', hide, true);
  window.addEventListener('scroll', hide, true);
}

function bind() {
  el.inspect.innerHTML = ICONS.crosshair; el.shot.innerHTML = ICONS.camera;
  el.omniIcon.innerHTML = ICONS.search; el.omniClear.innerHTML = ICONS.x;
  el.apReset.innerHTML = ICONS.rotateCcw;
  $('pt-g-note').innerHTML = ICONS.notebookPen; $('pt-g-del').innerHTML = ICONS.trash; $('pt-g-clear').innerHTML = ICONS.shredder;
  $('pt-keys-btn').innerHTML = ICONS.keyboard; buildKeysList();
  el.addNote.innerHTML = ICONS.notebookPen; el.rulerBtn.innerHTML = ICONS.ruler;
  updateThemeIcon();
  bindTips();

  const toggleDim = () => { if (el.dimPop.classList.contains('pt-open')) closeDim(); else openDim(); };
  el.dimVal.addEventListener('click', toggleDim);
  el.dimChev.addEventListener('click', toggleDim);
  // Custom mode: each input applies as soon as you leave it (tab / click away / Enter)
  el.dimW.addEventListener('change', () => setSize(Number(el.dimW.value) || state.w, state.h, { custom: true }));
  el.dimH.addEventListener('change', () => setSize(state.w, Number(el.dimH.value) || state.h, { custom: true }));
  [el.dimW, el.dimH].forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = inp === el.dimW ? state.w : state.h; inp.blur(); } }));
  el.theme.addEventListener('click', toggleTheme);

  el.omni.addEventListener('input', () => { el.omniWrap.classList.toggle('pt-has-value', !!el.omni.value); renderResults(el.omni.value); });
  el.omni.addEventListener('focus', () => { el.omni.select(); renderResults(el.omni.value); });
  // a pasted URL loads straight away — no Enter needed
  el.omni.addEventListener('paste', (e) => { const t = (e.clipboardData || window.clipboardData).getData('text').trim(); if (isUrlish(t)) { e.preventDefault(); el.omni.value = t; choose(t); } });
  el.omni.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter') { const rows = el.results.querySelectorAll('.pt-omni-item'); if (state.activeIdx >= 0 && rows[state.activeIdx]) choose(rows[state.activeIdx].dataset.target); else if (el.omni.value.trim()) choose(el.omni.value.trim()); }
    else if (e.key === 'Escape') hidePop(el.results);
  });
  el.omniClear.addEventListener('click', () => { el.omni.value = ''; el.omniWrap.classList.remove('pt-has-value'); renderResults(''); el.omni.focus(); });

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!el.omniWrap.contains(t) && !el.results.contains(t)) hidePop(el.results);
    if (!el.menu.contains(t) && !el.menuPop.contains(t)) hidePop(el.menuPop);
    if (!$('pt-keys-btn').contains(t) && !$('pt-keys-pop').contains(t)) hidePop($('pt-keys-pop'));
    if (!el.dim.contains(t) && !el.dimPop.contains(t)) closeDim();
  });
  window.addEventListener('resize', () => { hidePop(el.results); hidePop(el.menuPop); closeDim(); });

  el.inspect.addEventListener('click', () => setInspect(state.mode !== 'inspect'));
  el.shot.addEventListener('click', screenshot);
  $('pt-keys-btn').addEventListener('click', toggleKeys);
  el.menuBtn.addEventListener('click', () => { if (state.notesEmpty) { el.importInput.click(); return; } if (el.menuPop.classList.contains('pt-open') && !el.menuPop.classList.contains('pt-closing')) hidePop(el.menuPop); else { showPop(el.menuPop); anchorPop(el.menuPop, el.menuBtn, { align: 'right' }); } });
  el.copyAllBtn.addEventListener('click', () => { const text = allNotesText(); if (text) copyText(text); else toast('No notes on this page'); hidePop(el.menuPop); });
  el.exportBtn.addEventListener('click', () => { exportNotes(); hidePop(el.menuPop); });
  el.importBtn.addEventListener('click', () => { el.importInput.click(); hidePop(el.menuPop); });
  el.importInput.addEventListener('change', () => { const f = el.importInput.files && el.importInput.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => importNotes(String(r.result)); r.readAsText(f); el.importInput.value = ''; });
  el.clearBtn.addEventListener('click', () => { hidePop(el.menuPop); const n = state.targets.reduce((a, t) => a + t.notes.length, 0); if (!n) return; askConfirm(`Delete all ${n} note${n === 1 ? '' : 's'} on this page?`).then((yes) => { if (yes) { window.__infospector.clearAll(); toast('Notes cleared'); } }); });

  // moving onto the box keeps a hover-shown box alive; leaving it (unpinned) lets it go
  el.selbox.addEventListener('mouseenter', () => clearTimeout(state.hoverTimer));
  el.selbox.addEventListener('mouseleave', () => { if (!state.selPinned) { clearTimeout(state.hoverTimer); state.hoverTimer = setTimeout(() => { if (!state.selPinned) hideSelbox(); }, 350); } });
  el.addNote.addEventListener('click', () => { state.selPinned = true; addNoteToSelected(); });
  el.rulerBtn.addEventListener('click', wrapSelected);
  $('pt-g-note').addEventListener('click', () => { if (state.selectedGuide) addNoteToGuide(state.selectedGuide); });
  $('pt-g-del').addEventListener('click', () => { if (state.selectedGuide) deleteGuide(state.selectedGuide); });
  $('pt-g-clear').addEventListener('click', deleteAllGuides);

  el.frame.addEventListener('load', onFrameLoad);
  window.addEventListener('resize', () => { if (state.fillMode) { const a = availArea(); setSize(a.w, a.h, { fill: true, animate: false }); } else fit(); });

  window.addEventListener('message', (e) => {
    // only trust the inspector we injected: same origin, and sent from our own frame
    if (e.origin !== location.origin || e.source !== el.frame.contentWindow) return;
    const d = e.data; if (!d || d.__pt !== 1 || d.from !== 'inspector') return;
    if (d.type === 'ready') { postToFrame({ type: 'mode', mode: state.mode }); pushPins(); state.targets.forEach((t) => { if (t.ruler) setRuler(t.anchor.selector, true); }); }
    else if (d.type === 'selected' || d.type === 'regionSelected' || d.type === 'multiSelected') showSelbox({ payload: d.payload, anchor: d.anchor });
    else if (d.type === 'hovered') { if (!state.selPinned) showSelbox({ payload: d.payload, anchor: d.anchor }, { pin: false }); }
    else if (d.type === 'hoverCleared') { if (!state.selPinned) { clearTimeout(state.hoverTimer); state.hoverTimer = setTimeout(() => { if (!state.selPinned) hideSelbox(); }, 350); } }
    else if (d.type === 'cleared') { if (state.selected) hideSelbox(); }
    else if (d.type === 'selectionMoved') { if (state.selected) { state.selected.payload.rect = d.rect; placeSelbox(); } }
    else if (d.type === 'snapLines') state.snap = { x: d.x || [], y: d.y || [] };
    else if (d.type === 'gapHover') showGaps(d.x, d.y, d.mod);
    else if (d.type === 'frameDown') { if (state.selectedGuide) selectGuide(null); }   // a click into the page deselects the guide
    else if (d.type === 'rulerRect') { if (state.activeRulers.has(d.selector)) wrapGuides(d.selector, d.rect, { create: !!state.wrapPending && state.wrapPending === d.selector }); if (state.wrapPending === d.selector) state.wrapPending = null; }   // element measured (or moved) → snap guides to its edges
    else if (d.type === 'toggleInspect') toggleInspectShortcut();   // ⇧⌘I pressed while the frame had focus
    else if (d.type === 'inspectOn') { if (state.mode !== 'inspect') setInspect(true); }   // shift+click while peeking locks that element in
    else if (d.type === 'focusSearch') focusSearch();               // ⌘K pressed while the frame had focus
    else if (d.type === 'peek') setPeek(d.on);                        // Shift held/released while the frame had focus
    else if (d.type === 'pinClicked') openModal(d.id, { reveal: true });
  });

  bindHandles();
  bindRulersAndBg();
}

/* ---------------- boot ----------------------------------------------- */

// last size the user was looking at, else the largest size the viewport shows unscaled
function defaultSize() { try { const s = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null'); if (s && s.w && s.h) return s; } catch (e) { /* ignore */ } const a = availArea(); return { w: a.w, h: a.h, fill: false, custom: false, shape: BROWSER_SHAPE }; }

async function boot() {
  buildDimPop();
  bind();
  const ds = defaultSize();
  if (ds.fill) enterFill();
  else setSize(ds.w, ds.h, { animate: false, shape: ds.shape || null, custom: !!ds.custom });
  installRobotApi();
  bindSetup();
  if (!window.INFOSPECTOR_BRIDGE && savedBridge()) window.INFOSPECTOR_BRIDGE = savedBridge();   // chosen in first-run setup
  state.store = await resolveStore();
  await loadManifest();
  // open: ?url → the page you were last looking at → configured home → this origin's homepage
  let target = getHistory()[0] || savedHome() || (typeof window.INFOSPECTOR_HOME === 'string' && window.INFOSPECTOR_HOME) || DEFAULT_HOME;
  const params = new URLSearchParams(location.search);
  if (params.get('url')) target = params.get('url');
  loadTarget(target);
  let done = false; try { done = !!localStorage.getItem(SETUP_KEY); } catch (e) { done = true; }
  if (params.has('setup') || !done) openSetup();
  if (params.has('doctor')) setTimeout(showDoctor, 1500);
}

boot();
