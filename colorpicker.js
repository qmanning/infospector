/* Infospector — glass color picker.
   A single reusable popover (SV square + hue/alpha sliders, hex/RGB fields, a
   desktop-wide eyedropper where the browser offers one, and remembered swatches)
   that drives the plain <input type="color"> swatches already wired into the tool:
   on every change it writes the value back and fires the input's own events, so
   nothing downstream has to know the popover exists. Zero dependencies. */
import { parseRgb, hsbToHex, toHex } from './lib.js';

const RECENT_KEY = 'pt-cpick-recent';
const RECENT_MAX = 10;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const h2 = (x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0');

/* ---- color math (HSV is the picker's native space; the rest is derived) ---- */
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60); if (h < 0) h += 360;
  return { h, s: max ? Math.round((d / max) * 100) : 0, v: Math.round(max * 100) };
}
const hsvToRgb = (h, s, v) => parseRgb(hsbToHex(h, s, v));
const hex8 = ({ r, g, b }, a) => '#' + h2(r) + h2(g) + h2(b) + (a < 1 ? h2(a * 255) : '');

/* ---- remembered swatches ---- */
function getRecent() {
  try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.slice(0, RECENT_MAX) : []; } catch (e) { return []; }
}
function pushRecent(hex) {
  try {
    const key = hex.toLowerCase();
    let a = getRecent().filter((c) => c.toLowerCase() !== key);
    a.unshift(hex); a = a.slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(a));
  } catch (e) { /* ignore */ }
}

/* ---- the singleton popover ---- */
let pop = null;          // root element
let ui = null;           // cached child refs
let cur = { h: 0, s: 0, v: 0, a: 1 };   // current HSVA
let session = null;      // { input, alpha, onChange, anchor }
let onDocDown = null, onKeyDown = null;

const SVG = {
  eyedropper: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-4 9.5-9.5"/><path d="M14.5 6.5 17 4a2.1 2.1 0 0 1 3 3l-2.5 2.5"/><path d="m13 8 3 3"/></svg>',
};

function build() {
  pop = document.createElement('div');
  pop.id = 'pt-cpick';
  pop.className = 'pt-cpick';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Color picker');
  pop.hidden = true;
  pop.innerHTML = `
    <div class="pt-cp-sv" tabindex="0" aria-label="Saturation and brightness">
      <div class="pt-cp-sv-sat"></div><div class="pt-cp-sv-val"></div>
      <div class="pt-cp-sv-thumb"></div>
    </div>
    <div class="pt-cp-sliders">
      <input type="range" class="pt-cp-hue" min="0" max="360" step="1" aria-label="Hue" />
      <input type="range" class="pt-cp-alpha" min="0" max="100" step="1" aria-label="Opacity" />
    </div>
    <div class="pt-cp-fields">
      <button type="button" class="pt-cp-eyedrop" aria-label="Pick a color from the screen" data-tip="Pick a color from anywhere on screen">${SVG.eyedropper}</button>
      <label class="pt-cp-f pt-cp-hex"><span>HEX</span><input type="text" spellcheck="false" aria-label="Hex value" /></label>
      <label class="pt-cp-f pt-cp-c"><span>R</span><input type="text" inputmode="numeric" aria-label="Red" /></label>
      <label class="pt-cp-f pt-cp-c"><span>G</span><input type="text" inputmode="numeric" aria-label="Green" /></label>
      <label class="pt-cp-f pt-cp-c"><span>B</span><input type="text" inputmode="numeric" aria-label="Blue" /></label>
      <label class="pt-cp-f pt-cp-a"><span>Opacity</span><input type="text" inputmode="numeric" aria-label="Opacity percent" /></label>
    </div>
    <div class="pt-cp-recent" hidden>
      <div class="pt-cp-recent-title">Recent</div>
      <div class="pt-cp-recent-row"></div>
    </div>`;
  document.body.appendChild(pop);

  ui = {
    sv: pop.querySelector('.pt-cp-sv'),
    svThumb: pop.querySelector('.pt-cp-sv-thumb'),
    hue: pop.querySelector('.pt-cp-hue'),
    alpha: pop.querySelector('.pt-cp-alpha'),
    alphaField: pop.querySelector('.pt-cp-a'),
    eyedrop: pop.querySelector('.pt-cp-eyedrop'),
    hex: pop.querySelector('.pt-cp-hex input'),
    r: pop.querySelectorAll('.pt-cp-c input')[0],
    g: pop.querySelectorAll('.pt-cp-c input')[1],
    b: pop.querySelectorAll('.pt-cp-c input')[2],
    op: pop.querySelector('.pt-cp-a input'),
    recent: pop.querySelector('.pt-cp-recent'),
    recentRow: pop.querySelector('.pt-cp-recent-row'),
  };

  // native eyedropper (Chromium): samples a pixel from anywhere on the desktop.
  // Hidden where the browser has no such API — no web page can read pixels
  // outside itself in Firefox/Safari, so there is nothing honest to fall back to.
  if (!('EyeDropper' in window)) ui.eyedrop.hidden = true;

  wire();
}

function wire() {
  // SV square drag
  let svDrag = false;
  const svAt = (e) => {
    const r = ui.sv.getBoundingClientRect();
    cur.s = Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 100);
    cur.v = Math.round((1 - clamp((e.clientY - r.top) / r.height, 0, 1)) * 100);
    render(); emit();
  };
  ui.sv.addEventListener('pointerdown', (e) => { svDrag = true; ui.sv.setPointerCapture(e.pointerId); svAt(e); e.preventDefault(); });
  ui.sv.addEventListener('pointermove', (e) => { if (svDrag) svAt(e); });
  ui.sv.addEventListener('pointerup', (e) => { if (svDrag) { svDrag = false; commit(); } });
  ui.sv.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2; let hit = true;
    if (e.key === 'ArrowLeft') cur.s = clamp(cur.s - step, 0, 100);
    else if (e.key === 'ArrowRight') cur.s = clamp(cur.s + step, 0, 100);
    else if (e.key === 'ArrowUp') cur.v = clamp(cur.v + step, 0, 100);
    else if (e.key === 'ArrowDown') cur.v = clamp(cur.v - step, 0, 100);
    else hit = false;
    if (hit) { e.preventDefault(); render(); emit(); commit(); }
  });

  ui.hue.addEventListener('input', () => { cur.h = Number(ui.hue.value); render(); emit(); });
  ui.hue.addEventListener('change', commit);
  ui.alpha.addEventListener('input', () => { cur.a = Number(ui.alpha.value) / 100; render(); emit(); });
  ui.alpha.addEventListener('change', commit);

  // typed fields
  ui.hex.addEventListener('change', () => {
    const raw = ui.hex.value.trim().replace(/^#?/, '#');
    const rgb = parseRgb(raw);
    if (!rgb) { render(); return; }
    // keep the current opacity unless the typed value carried its own (8-digit) alpha
    const hasAlpha = /^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(raw);
    setFromRgb(rgb, hasAlpha ? rgb.a : cur.a); emit(); commit();
  });
  const onRgbField = () => {
    const rgb = { r: clamp(+ui.r.value || 0, 0, 255), g: clamp(+ui.g.value || 0, 0, 255), b: clamp(+ui.b.value || 0, 0, 255) };
    setFromRgb(rgb, cur.a); emit(); commit();
  };
  [ui.r, ui.g, ui.b].forEach((f) => f.addEventListener('change', onRgbField));
  ui.op.addEventListener('change', () => { cur.a = clamp((parseFloat(ui.op.value) || 0) / 100, 0, 1); render(); emit(); commit(); });

  ui.eyedrop.addEventListener('click', async () => {
    try {
      const res = await new window.EyeDropper().open();   // sRGBHex from anywhere on screen
      const rgb = parseRgb(res.sRGBHex); if (rgb) { setFromRgb(rgb, cur.a); emit(); commit(); }
    } catch (e) { /* user hit Escape — no-op */ }
  });

  ui.recentRow.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-c]'); if (!sw) return;
    const rgb = parseRgb(sw.dataset.c); if (!rgb) return;
    setFromRgb(rgb, rgb.a != null ? rgb.a : cur.a); render(); emit(); commit();
  });

}

function setFromRgb(rgb, a) {
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  // keep the current hue when the color is a pure grey (its hue is otherwise meaningless and would snap to 0)
  cur = { h: rgb.r === rgb.g && rgb.g === rgb.b ? cur.h : hsv.h, s: hsv.s, v: hsv.v, a: clamp(a == null ? 1 : a, 0, 1) };
  render();
}

/* current color as {r,g,b}, hex, and alpha-aware string */
function rgbNow() { return hsvToRgb(cur.h, cur.s, cur.v); }
function hexNow() { const c = rgbNow(); return '#' + h2(c.r) + h2(c.g) + h2(c.b); }
function valueNow() { return cur.a < 1 ? hex8(rgbNow(), cur.a) : hexNow(); }

function render() {
  if (!pop) return;
  const rgb = rgbNow(), hex = hexNow();
  const hueRgb = hsvToRgb(cur.h, 100, 100);
  const hueHex = '#' + h2(hueRgb.r) + h2(hueRgb.g) + h2(hueRgb.b);
  ui.sv.style.setProperty('--hue', hueHex);
  ui.svThumb.style.left = cur.s + '%';
  ui.svThumb.style.top = (100 - cur.v) + '%';
  ui.svThumb.style.background = hex;
  ui.hue.value = String(cur.h);
  ui.alpha.value = String(Math.round(cur.a * 100));
  ui.alpha.style.setProperty('--stop', hex);
  ui.hue.style.setProperty('--fill', (cur.h / 360 * 100) + '%');
  // HEX field stays 6-digit; alpha rides in its own Opacity field (or none, when alpha's off)
  if (document.activeElement !== ui.hex) ui.hex.value = (session && session.alpha ? hex : (cur.a < 1 ? hex8(rgb, cur.a) : hex)).toUpperCase();
  if (document.activeElement !== ui.r) ui.r.value = String(rgb.r);
  if (document.activeElement !== ui.g) ui.g.value = String(rgb.g);
  if (document.activeElement !== ui.b) ui.b.value = String(rgb.b);
  if (document.activeElement !== ui.op) ui.op.value = Math.round(cur.a * 100) + '%';
}

function renderRecent() {
  const recent = getRecent();
  ui.recent.hidden = recent.length === 0;
  ui.recentRow.innerHTML = recent.map((c) => `<button type="button" class="pt-cp-sw" data-c="${c}" style="--sw:${c}" title="${c}" aria-label="${c}"></button>`).join('');
}

/* live-apply to the bound input, mirroring what the tool's own controls do */
function emit() { if (session && session.onChange) session.onChange(valueNow()); }
function commit() { if (session) pushRecent(hexNow()); }

function place() {
  if (!session || !session.anchor) return;
  const a = session.anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight, gap = 8, m = 8;
  let left = a.left, top = a.bottom + gap;
  if (top + h > window.innerHeight - m) top = Math.max(m, a.top - gap - h);   // flip above if it would overflow
  left = clamp(left, m, window.innerWidth - w - m);
  top = clamp(top, m, window.innerHeight - h - m);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}

function open(anchor, initial, opts) {
  if (!pop) build();
  session = { anchor, onChange: opts.onChange, alpha: opts.alpha !== false };
  ui.alphaField.hidden = !session.alpha;
  ui.alpha.parentElement.classList.toggle('pt-no-alpha', !session.alpha);
  ui.alpha.hidden = !session.alpha;
  const rgb = parseRgb(initial) || { r: 0, g: 0, b: 0, a: 1 };
  setFromRgb(rgb, session.alpha && rgb.a != null ? rgb.a : 1);
  renderRecent();
  pop.hidden = false;
  place();
  requestAnimationFrame(() => { pop.classList.add('pt-open'); place(); });
  onDocDown = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
  // Escape closes the picker first, ahead of any sheet/panel behind it (capture + stop)
  onKeyDown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  setTimeout(() => document.addEventListener('pointerdown', onDocDown, true), 0);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
}

function close() {
  if (!pop || pop.hidden) return;
  pop.classList.remove('pt-open');
  document.removeEventListener('pointerdown', onDocDown, true);
  document.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
  const el = pop; setTimeout(() => { if (!el.classList.contains('pt-open')) el.hidden = true; }, 140);
  session = null;
}

/* Public: turn a plain <input type="color"> (optionally paired with a text field)
   into a trigger for the glass popover. `read` returns the input's current value;
   `write(value)` applies a new one. Alpha is offered only when `alpha` is true. */
export function attachColorPicker(swatch, { read, write, alpha = false } = {}) {
  read = read || (() => swatch.value);
  write = write || ((v) => { swatch.value = toHex(v); swatch.dispatchEvent(new Event('input', { bubbles: true })); });
  const openFor = (e) => {
    e.preventDefault();
    if (session && session.anchor === swatch) { close(); return; }
    open(swatch, read(), { alpha, onChange: write });
  };
  swatch.addEventListener('mousedown', openFor);          // beat the OS picker (it opens on mousedown)
  swatch.addEventListener('click', (e) => e.preventDefault());
  swatch.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openFor(e); });
}

export function closeColorPicker() { close(); }
