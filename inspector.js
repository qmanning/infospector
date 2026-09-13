/*
 * Preview Tester — inspector (runs INSIDE the framed page).
 * Injected by the host into a same-origin iframe; talks over postMessage.
 *   - hover highlight + click-to-SELECT when inspect mode is on
 *   - serialize a selected element into an AI-legible identity payload
 *   - render/position note markers (one per object, with a count badge)
 *   - reveal temporarily-hidden elements; draw dimension rulers
 */
(function () {
  'use strict';
  if (window.__ptInspector) return;

  var MARK = '__ptInspector';
  var STATE_COLORS = { open: '#ffd83d', noted: '#a259ff', done: '#46c17b', reviewed: '#a259ff', working: '#a259ff', complete: '#46c17b' };
  // black or white text, whichever contrasts with the marker's own fill
  function inkFor(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); if (!m) return '#fff';
    var lin = function (c) { c = parseInt(c, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
    return L > 0.45 ? '#111' : '#fff';
  }

  // ---------- serialization ------------------------------------------------

  function collapseWhitespace(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function round1(n) { return Math.round(n * 10) / 10; }
  function roundRect(r) { return { x: round1(r.x), y: round1(r.y), width: round1(r.width), height: round1(r.height) }; }
  function cssEscape(str) { return (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(str) : String(str).replace(/([^\w-])/g, '\\$1'); }
  function getAttrs(el) {
    var attrs = {};
    var role = el.getAttribute('role'); if (role) attrs.role = role;
    var testid = el.getAttribute('data-testid'); if (testid) attrs['data-testid'] = testid;
    var list = el.attributes || [];
    for (var i = 0; i < list.length; i++) { var a = list[i]; if (a.name.indexOf('data-') === 0) attrs[a.name] = a.value; }
    ['href', 'src', 'alt'].forEach(function (k) { if (el.hasAttribute && el.hasAttribute(k)) attrs[k] = el.getAttribute(k); });
    return attrs;
  }
  function getStyleSnapshot(el) {
    var cs = window.getComputedStyle(el);
    return { borderRadius: cs.borderRadius, padding: cs.padding, margin: cs.margin, fontSize: cs.fontSize, color: cs.color, backgroundColor: cs.backgroundColor, display: cs.display, position: cs.position, zIndex: cs.zIndex };
  }
  function isUniqueSelector(sel, el) { try { var n = document.querySelectorAll(sel); return n.length === 1 && n[0] === el; } catch (e) { return false; } }
  function nthOfTypeSelector(el) {
    var tag = el.tagName.toLowerCase(), parent = el.parentElement; if (!parent) return tag;
    var siblings = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === el.tagName; });
    return tag + ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
  }
  function buildCssPath(el) {
    var segments = [], node = el, root = null;
    while (node && node.nodeType === 1) {
      if (node !== el) {
        var id = node.getAttribute('id');
        if (id) { var idSel = '#' + cssEscape(id); if (isUniqueSelector(idSel, node)) { root = idSel; break; } }
        var testid = node.getAttribute('data-testid');
        if (testid) { var tid = '[data-testid="' + testid.replace(/"/g, '\\"') + '"]'; if (isUniqueSelector(tid, node)) { root = tid; break; } }
      }
      if (node.tagName === 'BODY') { root = 'body'; break; }
      segments.unshift(nthOfTypeSelector(node));
      node = node.parentElement;
    }
    if (!root) root = 'body';
    return root + (segments.length ? ' > ' + segments.join(' > ') : '');
  }
  function getSelectors(el) {
    var list = [];
    var id = el.getAttribute('id');
    if (id) { var idSel = '#' + cssEscape(id); if (isUniqueSelector(idSel, el)) list.push(idSel); }
    var testid = el.getAttribute('data-testid');
    if (testid) { var tid = '[data-testid="' + testid.replace(/"/g, '\\"') + '"]'; if (isUniqueSelector(tid, el)) list.push(tid); }
    var pathSel = buildCssPath(el);
    if (list.indexOf(pathSel) === -1 && (isUniqueSelector(pathSel, el) || !list.length)) list.push(pathSel);
    return list;
  }
  function findFiberKey(el) { for (var k in el) { if (Object.prototype.hasOwnProperty.call(el, k) && k.indexOf('__reactFiber') === 0) return k; } return null; }
  function skipName(name) { if (!name) return true; if (name === 'Fragment' || name === 'Suspense' || name === 'Provider') return true; if (/^[a-z_]/.test(name)) return true; return false; }
  function getReactComponents(el) {
    var node = el, fiber = null;
    while (node) { var key = findFiberKey(node); if (key) { fiber = node[key]; break; } node = node.parentElement; }
    if (!fiber) return [];
    var names = [], f = fiber;
    while (f) {
      var type = f.type;
      if (typeof type === 'function') { var name = type.displayName || type.name; if (!skipName(name) && names[names.length - 1] !== name) names.push(name); }
      f = f.return; if (names.length >= 8) break;
    }
    return names.slice(0, 8);
  }
  function getLineage(el) {
    var result = [], node = el.parentElement;
    while (node && result.length < 3) { var tag = node.tagName.toLowerCase(); var cls = node.classList && node.classList.length ? node.classList[0] : null; result.push(cls ? tag + '.' + cls : tag); node = node.parentElement; }
    return result;
  }
  function effectiveZIndex(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      var z = window.getComputedStyle(node).zIndex;
      if (z && z !== 'auto') return z;
      node = node.parentElement;
    }
    return 'auto';
  }
  function serializeElement(el) {
    var classes = el.classList ? Array.prototype.slice.call(el.classList) : [];
    var collapsed = collapseWhitespace(el.textContent || '');
    var name = el.getAttribute('aria-label') || el.getAttribute('data-testid') || (collapsed ? collapsed.slice(0, 80) : '') || el.tagName.toLowerCase();
    var rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(), id: el.getAttribute('id') || null, classes: classes, name: name,
      attrs: getAttrs(el), text: collapsed.slice(0, 160), rect: roundRect(rect), style: getStyleSnapshot(el),
      zIndex: effectiveZIndex(el), selectors: getSelectors(el), components: getReactComponents(el), lineage: getLineage(el)
    };
  }

  // ---------- messaging ----------------------------------------------------

  // We are only ever injected into a same-origin frame, so the host shares our origin:
  // pin it, so element data never leaks to a foreign parent.
  function send(type, extra) {
    var msg = { __pt: 1, from: 'inspector', type: type };
    if (extra) for (var k in extra) msg[k] = extra[k];
    try { window.parent.postMessage(msg, location.origin); } catch (e) { /* no-op */ }
  }

  // ---------- overlay layer ------------------------------------------------

  var mode = 'view';
  var pins = {};        // id -> { el, pin }
  var markers = [];     // last render set
  var selectedEl = null;
  var revealed = {};    // selector -> [{node, prevCss, hadHidden}]
  var rulers = {};      // selector -> true (wrapped by host guides)

  var style = document.createElement('style');
  style.textContent =
    '.pt-hl{position:fixed;pointer-events:none;z-index:2147481000;border:1px solid #4f8cff;background:rgba(79,140,255,0.12);border-radius:2px;display:none;}' +
    '.pt-sel{position:fixed;pointer-events:none;z-index:2147481200;border:2px solid #4f8cff;border-radius:2px;display:none;box-shadow:0 0 0 1px rgba(255,255,255,.35);}' +
    '.pt-pin-layer{position:fixed;inset:0;pointer-events:none;z-index:2147482500;}' +
    '.pt-pin{position:absolute;min-width:22px;height:22px;padding:0 5px;margin:-11px 0 0 -11px;border-radius:11px;background:#6b7280;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer;pointer-events:auto;display:grid;place-items:center;border:2px solid #fff;color:#fff;font:700 11px -apple-system,system-ui,sans-serif;}' +
    '.pt-pin.pt-focus{outline:3px solid rgba(79,140,255,.5);outline-offset:2px;}' +
    /* shift+drag area selection (marquee while dragging, dotted outline once selected / saved) */
    '.pt-marq{position:fixed;pointer-events:none;z-index:2147481300;border:2px dotted #ffd83d;background:rgba(255,216,61,.10);border-radius:2px;display:none;}' +
    '.pt-region-sel{position:fixed;pointer-events:none;z-index:2147481250;border:2px dotted #ffd83d;border-radius:2px;display:none;}' +
    '.pt-region{position:absolute;pointer-events:none;border:2px dotted #ffd83d;border-radius:2px;}' +
    /* inspect mode: crosshair everywhere, no link pointers */
    'html.pt-inspecting,html.pt-inspecting *{cursor:crosshair!important;}' +
    '.pt-multi{position:fixed;inset:0;pointer-events:none;z-index:2147481200;}' +
    '.pt-multi>div{position:absolute;border:2px solid #4f8cff;border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.35);}';
  var hl = document.createElement('div'); hl.className = 'pt-hl';
  var sel = document.createElement('div'); sel.className = 'pt-sel';
  var layer = document.createElement('div'); layer.className = 'pt-pin-layer';
  var multiLayer = document.createElement('div'); multiLayer.className = 'pt-multi';   // outlines for ⇧⌘-click multi-select
  var selectedEls = [];
  var marq = document.createElement('div'); marq.className = 'pt-marq';
  var regionSel = document.createElement('div'); regionSel.className = 'pt-region-sel';
  [hl, sel, layer, marq, regionSel, multiLayer].forEach(function (n) { n.setAttribute('data-pt-overlay', ''); });

  function mount() {
    document.documentElement.appendChild(style);
    document.body.appendChild(hl);
    document.body.appendChild(sel);
    document.body.appendChild(layer);
    document.body.appendChild(marq);
    document.body.appendChild(regionSel);
    document.body.appendChild(multiLayer);
  }

  // anything we drew (highlights, pins, rulers and their children) is never a pick target
  function isOverlayNode(el) { return !!(el.closest && el.closest('[data-pt-overlay]')); }
  function deepTarget(x, y) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) { var el = stack[i]; if (!isOverlayNode(el)) return el; }
    return null;
  }
  function place(node, r) { node.style.left = r.left + 'px'; node.style.top = r.top + 'px'; node.style.width = r.width + 'px'; node.style.height = r.height + 'px'; }

  // peek: Shift held outside inspect mode shows the hover box (clicks stay untouched)
  var peek = false, pendingSelect = null;   // pendingSelect: element shift-clicked while peeking, selected once inspect lands
  function setPeek(on) { on = !!on; if (peek === on) return; peek = on; if (!on) hl.style.display = 'none'; }

  var hoverEl = null;   // the element the info box is currently describing on hover
  function onMove(e) {
    if ((mode !== 'inspect' && !peek) || marqActive) return;
    var el = deepTarget(e.clientX, e.clientY);
    if (!el || el === document.body || el === document.documentElement) { hl.style.display = 'none'; if (hoverEl) { hoverEl = null; send('hoverCleared'); } return; }
    hl.style.display = 'block'; place(hl, el.getBoundingClientRect());
    if (el !== hoverEl) {   // the host floats the info box above whatever is hovered; a click pins it
      hoverEl = el;
      var r = el.getBoundingClientRect();
      send('hovered', { payload: serializeElement(el), anchor: { selector: getSelectors(el)[0] || null, frac: { fx: 0.5, fy: 0.5 }, rectAtCapture: roundRect(r) } });
    }
  }
  document.addEventListener('mouseleave', function () { if (hoverEl) { hoverEl = null; send('hoverCleared'); } });

  function onClick(e) {
    if (mode !== 'inspect') {
      // shift+click while peeking: lock this element in — turn Inspect on and select it
      if (peek && e.shiftKey && !isOverlayNode(e.target)) {
        e.preventDefault(); e.stopPropagation();
        var pel = deepTarget(e.clientX, e.clientY);
        if (pel && pel !== document.body && pel !== document.documentElement) { pendingSelect = { el: pel, x: e.clientX, y: e.clientY }; send('inspectOn'); }
      }
      return;
    }
    if (isOverlayNode(e.target)) return;                       // pins handle their own clicks
    e.preventDefault(); e.stopPropagation();                   // never let the page act on a click
    if (suppressClick) { suppressClick = false; return; }      // the click that ends a marquee
    var el = deepTarget(e.clientX, e.clientY);
    if (!el || el === document.body || el === document.documentElement) return;
    selectedRegion = null; regionSel.style.display = 'none';
    if (e.shiftKey && (e.metaKey || e.ctrlKey)) {   // ⇧⌘-click: toggle this element in a multi-selection
      if (selectedEl && selectedEls.indexOf(selectedEl) === -1) selectedEls.push(selectedEl);
      selectedEl = null; sel.style.display = 'none';
      var at = selectedEls.indexOf(el);
      if (at === -1) selectedEls.push(el); else selectedEls.splice(at, 1);
      if (selectedEls.length === 1) { var only = selectedEls[0]; selectedEls = []; drawMulti(); selectSingle(only, e); return; }
      drawMulti();
      if (!selectedEls.length) { send('cleared'); return; }
      sendMulti();
      return;
    }
    selectedEls = []; drawMulti();
    selectSingle(el, e);
  }
  function selectSingle(el, e) {
    selectedEl = el;
    var r = el.getBoundingClientRect();
    sel.style.display = 'block'; place(sel, r);
    hl.style.display = 'none';
    var frac = { fx: r.width ? (e.clientX - r.left) / r.width : 0.5, fy: r.height ? (e.clientY - r.top) / r.height : 0.5 };
    send('selected', { payload: serializeElement(el), anchor: { selector: getSelectors(el)[0] || null, frac: frac, rectAtCapture: roundRect(r) } });
  }
  function unionRect(els) {
    var l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
    els.forEach(function (n) { var r = n.getBoundingClientRect(); l = Math.min(l, r.left); t = Math.min(t, r.top); rr = Math.max(rr, r.right); b = Math.max(b, r.bottom); });
    return { x: l, y: t, left: l, top: t, width: rr - l, height: b - t };
  }
  function drawMulti() {
    while (multiLayer.children.length > selectedEls.length) multiLayer.removeChild(multiLayer.lastChild);
    while (multiLayer.children.length < selectedEls.length) multiLayer.appendChild(document.createElement('div'));
    selectedEls.forEach(function (n, i) { place(multiLayer.children[i], n.getBoundingClientRect()); });
  }
  function sendMulti() {
    var u = unionRect(selectedEls);
    var members = selectedEls.map(function (n) { return { name: nameOf(n), tag: n.tagName.toLowerCase(), selector: getSelectors(n)[0] || null }; });
    send('multiSelected', {
      payload: { tag: 'multi', name: members.length + ' elements', rect: roundRect(u), members: members, selectors: [], components: [], attrs: {}, zIndex: '—' },
      anchor: { selector: null, multi: members.map(function (m) { return m.selector; }) }
    });
  }

  function clearSelection() { selectedEl = null; selectedRegion = null; selectedEls = []; hoverEl = null; drawMulti(); sel.style.display = 'none'; regionSel.style.display = 'none'; }

  // ---------- inspect mode: swallow the page's own pointer handling -------
  // (stopPropagation only for pointer events — preventDefault on pointerdown would also
  //  cancel the compatibility mouse events our marquee and click handling rely on)
  function blockPointer(e) { if (mode !== 'inspect' || isOverlayNode(e.target)) return; e.stopPropagation(); }
  function blockMouse(e) { if (mode !== 'inspect' || isOverlayNode(e.target)) return; e.preventDefault(); e.stopPropagation(); }

  // ---------- shift+drag marquee → area selection --------------------------
  var marqActive = false, marqStart = null, suppressClick = false, selectedRegion = null;
  function onDown(e) {
    if (!isOverlayNode(e.target)) send('frameDown');   // any press on the page: the host deselects its guide
    if (mode !== 'inspect' && peek && e.shiftKey && !isOverlayNode(e.target)) { e.preventDefault(); e.stopPropagation(); return; }   // no text-select / link press under a peek click
    if (mode !== 'inspect' || isOverlayNode(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.shiftKey && e.button === 0 && !(e.metaKey || e.ctrlKey)) {
      marqActive = true; marqStart = { x: e.clientX, y: e.clientY };
      hl.style.display = 'none';
      marq.style.display = 'block'; place(marq, { left: e.clientX, top: e.clientY, width: 0, height: 0 });
    }
  }
  function marqRect(e) {
    var x1 = Math.min(marqStart.x, e.clientX), y1 = Math.min(marqStart.y, e.clientY);
    return { left: x1, top: y1, width: Math.abs(e.clientX - marqStart.x), height: Math.abs(e.clientY - marqStart.y) };
  }
  function onMarqMove(e) { if (!marqActive) return; e.preventDefault(); place(marq, marqRect(e)); }
  function onUp(e) {
    if (mode !== 'inspect' || isOverlayNode(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if (!marqActive) return;
    marqActive = false; marq.style.display = 'none'; suppressClick = true;
    var r = marqRect(e); if (r.width < 4 || r.height < 4) return;
    var vr = { x: r.left, y: r.top, left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height, width: r.width, height: r.height };
    selectedEl = null; sel.style.display = 'none';
    selectedRegion = { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    regionSel.style.display = 'block'; place(regionSel, vr);
    send('regionSelected', {
      payload: { tag: 'region', name: 'Area ' + selectedRegion.w + '×' + selectedRegion.h, rect: roundRect(vr), region: selectedRegion, touching: touching(vr), selectors: [], components: [], attrs: {}, zIndex: '—' },
      anchor: { selector: null, region: selectedRegion }
    });
  }
  function hasDirectText(el) { for (var i = 0; i < el.childNodes.length; i++) { var n = el.childNodes[i]; if (n.nodeType === 3 && n.nodeValue.trim()) return true; } return false; }
  function nameOf(el) {
    var t = collapseWhitespace(el.textContent || '');
    return el.getAttribute('aria-label') || el.getAttribute('data-testid') || el.getAttribute('alt') || (t ? t.slice(0, 60) : '') || el.tagName.toLowerCase();
  }
  // the elements a marquee overlaps — meaningful ones only (text, media, controls, id'd), smallest first
  function touching(box) {
    var out = [], all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i], tag = el.tagName;
      if (isOverlayNode(el) || /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|BR|HR|TEMPLATE)$/.test(tag)) continue;
      var r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) continue;
      var meaningful = /^(IMG|SVG|PICTURE|VIDEO|CANVAS|BUTTON|A|INPUT|TEXTAREA|SELECT|LABEL|H1|H2|H3|H4|H5|H6|P|LI|BLOCKQUOTE|FIGCAPTION)$/.test(tag) || el.id || el.getAttribute('data-testid') || hasDirectText(el);
      if (meaningful) out.push({ el: el, area: r.width * r.height });
    }
    out.sort(function (a, b) { return a.area - b.area; });
    return out.slice(0, 15).map(function (o) { return { name: nameOf(o.el), tag: o.el.tagName.toLowerCase(), selector: getSelectors(o.el)[0] || null }; });
  }

  // ---------- markers ------------------------------------------------------

  function anchorRect(anchor) {
    var target = null;
    if (anchor && anchor.selector) { try { target = document.querySelector(anchor.selector); } catch (e) {} }
    if (target) return { rect: target.getBoundingClientRect(), found: true };
    if (anchor && anchor.rectAtCapture) return { rect: anchor.rectAtCapture, found: false };
    return null;
  }
  function positionPin(rec) {
    var a = rec.marker.anchor || {};
    if (a.multi) {
      var els = a.multi.map(function (sl) { try { return document.querySelector(sl); } catch (e) { return null; } }).filter(Boolean);
      if (!els.length) { rec.pin.style.display = 'none'; (rec.outlines || []).forEach(function (o) { o.style.display = 'none'; }); return; }
      els.forEach(function (n, i) { var o = rec.outlines && rec.outlines[i]; if (o) { o.style.display = 'block'; place(o, n.getBoundingClientRect()); } });
      var u = unionRect(els);
      rec.pin.style.display = 'grid'; rec.pin.style.left = u.left + 'px'; rec.pin.style.top = u.top + 'px';
      return;
    }
    if (a.region) {   // area note: dotted outline + pin at its top-left corner
      var rx = a.region.x - window.scrollX, ry = a.region.y - window.scrollY;
      if (rec.outline) place(rec.outline, { left: rx, top: ry, width: a.region.w, height: a.region.h });
      var onscreen = ry + a.region.h > -60 && ry < window.innerHeight + 60 && rx + a.region.w > -60 && rx < window.innerWidth + 60;
      rec.pin.style.display = onscreen ? 'grid' : 'none';
      rec.pin.style.left = rx + 'px'; rec.pin.style.top = ry + 'px';
      return;
    }
    var info = anchorRect(a);
    if (!info) { rec.pin.style.display = 'none'; return; }
    var r = info.rect;
    var fx = a.frac ? a.frac.fx : 0.5, fy = a.frac ? a.frac.fy : 0.5;
    var x = (r.left != null ? r.left : r.x) + fx * r.width;
    var y = (r.top != null ? r.top : r.y) + fy * r.height;
    var vis = y > -60 && y < window.innerHeight + 60 && x > -60 && x < window.innerWidth + 60;
    rec.pin.style.display = vis ? 'grid' : 'none';
    rec.pin.style.left = x + 'px'; rec.pin.style.top = y + 'px';
  }
  function renderPins(list) {
    markers = list || [];
    layer.innerHTML = ''; pins = {};
    markers.forEach(function (m) {
      var pin = document.createElement('div');
      pin.className = 'pt-pin';
      var fill = STATE_COLORS[m.state] || STATE_COLORS.open;
      pin.style.background = fill; pin.style.color = inkFor(fill);
      // how many notes are still open on this object; ✓ once they're all done
      var remaining = typeof m.remaining === 'number' ? m.remaining : m.count;
      pin.textContent = remaining > 0 ? String(remaining) : '✓';
      pin.addEventListener('click', function (ev) { ev.stopPropagation(); send('pinClicked', { id: m.id }); });
      var outline = null, outlines = null;
      if (m.anchor && m.anchor.region) { outline = document.createElement('div'); outline.className = 'pt-region'; layer.appendChild(outline); }
      if (m.anchor && m.anchor.multi) { outlines = m.anchor.multi.map(function () { var o = document.createElement('div'); o.className = 'pt-region'; o.style.borderColor = '#4f8cff'; layer.appendChild(o); return o; }); }
      layer.appendChild(pin);
      pins[m.id] = { pin: pin, marker: m, outline: outline, outlines: outlines };
      positionPin(pins[m.id]);
    });
  }
  function focusPin(id) { for (var pid in pins) pins[pid].pin.classList.toggle('pt-focus', pid === id); if (pins[id]) positionPin(pins[id]); }

  // ---------- reveal hidden ------------------------------------------------

  function isHidden(node) {
    if (node.nodeType !== 1) return false;
    if (node.hasAttribute && node.hasAttribute('hidden')) return true;
    var cs = window.getComputedStyle(node);
    return cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
  }
  function reveal(selector, on) {
    if (on) {
      if (revealed[selector]) return;
      var el = null; try { el = document.querySelector(selector); } catch (e) {}
      if (!el) return;
      var changed = [], node = el;
      while (node && node.nodeType === 1) {
        if (isHidden(node)) {
          changed.push({ node: node, prevCss: node.getAttribute('style') || '', hadHidden: node.hasAttribute('hidden') });
          if (node.hasAttribute('hidden')) node.removeAttribute('hidden');
          node.style.setProperty('display', 'block', 'important');
          node.style.setProperty('visibility', 'visible', 'important');
          node.style.setProperty('opacity', '1', 'important');
          node.style.setProperty('pointer-events', 'auto', 'important');
        }
        node = node.parentElement;
      }
      revealed[selector] = changed;
      repositionAll();
    } else {
      var recs = revealed[selector]; if (!recs) return;
      recs.forEach(function (r) {
        if (r.prevCss) r.node.setAttribute('style', r.prevCss); else r.node.removeAttribute('style');
        if (r.hadHidden) r.node.setAttribute('hidden', '');
      });
      delete revealed[selector];
      repositionAll();
    }
  }

  // ---------- ruler wrap: the host snaps its red guides to the element's edges ----------
  // we only measure; the host owns the guides. Re-measured on scroll/resize so they follow.
  function measureRuler(selector) {
    var el = null; try { el = document.querySelector(selector); } catch (e) {}
    if (!el) return;
    send('rulerRect', { selector: selector, rect: roundRect(el.getBoundingClientRect()) });
  }
  function setRuler(selector, on) {
    if (on) { rulers[selector] = true; measureRuler(selector); }
    else delete rulers[selector];
  }
  // edges of the visible elements, for guide snapping (viewport px, de-duped, capped)
  function snapLines() {
    var xs = {}, ys = {}, count = 0;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length && count < 600; i++) {
      var n = all[i]; if (isOverlayNode(n)) continue;
      var tag = n.tagName; if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BR' || tag === 'WBR') continue;
      var r = n.getBoundingClientRect(); if (r.width < 8 || r.height < 8) continue;
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
      var cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      var sel = getSelectors(n)[0] || tag.toLowerCase(); count++;
      var put = function (map, pos, edge) { var k = Math.round(pos); if (!map[k]) map[k] = { pos: k, selector: sel, edge: edge }; };
      put(xs, r.left, 'left'); put(xs, r.right, 'right'); put(ys, r.top, 'top'); put(ys, r.bottom, 'bottom');
    }
    var toArr = function (m) { return Object.keys(m).map(function (k) { return m[k]; }); };
    send('snapLines', { x: toArr(xs), y: toArr(ys) });
  }
  // ⌘/Ctrl-hover: the host shows the distance between the guides around the pointer
  var gapRaf = 0;
  function relayGapHover(e) {
    var mod = e.metaKey || e.ctrlKey;
    if (!mod && !gapRaf) return;
    if (gapRaf) return; gapRaf = requestAnimationFrame(function () { gapRaf = 0; send('gapHover', { x: e.clientX, y: e.clientY, mod: mod }); });
  }

  // ---------- reposition ---------------------------------------------------

  function repositionAll() {
    for (var id in pins) positionPin(pins[id]);
    // keep the selection outline glued to its element/area and tell the host where it went
    if (selectedEl && document.body.contains(selectedEl)) { var er = selectedEl.getBoundingClientRect(); place(sel, er); send('selectionMoved', { rect: roundRect(er) }); }
    else if (selectedRegion) { var rr = { left: selectedRegion.x - window.scrollX, top: selectedRegion.y - window.scrollY, width: selectedRegion.w, height: selectedRegion.h }; place(regionSel, rr); send('selectionMoved', { rect: { x: rr.left, y: rr.top, width: rr.width, height: rr.height } }); }
    else if (selectedEls.length) { drawMulti(); var mu = unionRect(selectedEls); send('selectionMoved', { rect: roundRect(mu) }); }
    for (var s in rulers) measureRuler(s);
  }

  window.addEventListener('message', function (e) {
    // only obey our own host: same origin, and it must be the window framing us
    if (e.source !== window.parent || e.origin !== location.origin) return;
    var d = e.data; if (!d || d.__pt !== 1 || d.from !== 'host') return;
    if (d.type === 'mode') {
      mode = d.mode; hl.style.display = 'none'; hoverEl = null; marqActive = false; marq.style.display = 'none'; if (mode !== 'inspect') clearSelection(); document.documentElement.classList.toggle('pt-inspecting', mode === 'inspect');
      if (mode === 'inspect' && pendingSelect) { var ps = pendingSelect; pendingSelect = null; setPeek(false); selectedEls = []; drawMulti(); selectSingle(ps.el, { clientX: ps.x, clientY: ps.y }); }
      else pendingSelect = null;
    }
    else if (d.type === 'renderPins') renderPins(d.pins);
    else if (d.type === 'focusPin') focusPin(d.id);
    else if (d.type === 'clearSelection') clearSelection();
    else if (d.type === 'peek') setPeek(d.on);
    else if (d.type === 'reveal') reveal(d.selector, d.on);
    else if (d.type === 'ruler') setRuler(d.selector, d.on);
    else if (d.type === 'snapLines') snapLines();
  });

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mousemove', relayGapHover, true);
  document.addEventListener('keyup', function (e) { if (e.key === 'Meta' || e.key === 'Control') send('gapHover', { x: -1, y: -1, mod: false }); }, true);
  document.addEventListener('mousemove', onMarqMove, true);
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('mouseup', onUp, true);
  document.addEventListener('click', onClick, true);
  ['pointerdown', 'pointerup'].forEach(function (t) { document.addEventListener(t, blockPointer, true); });
  ['dblclick', 'auxclick', 'contextmenu'].forEach(function (t) { document.addEventListener(t, blockMouse, true); });
  // ⇧⌘I inside the framed page toggles inspect on the host
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key || '').toLowerCase() === 'i') { e.preventDefault(); send('toggleInspect'); return; }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key || '').toLowerCase() === 'k') { e.preventDefault(); send('focusSearch'); return; }
    if (e.key === 'Shift' && !e.repeat && mode !== 'inspect') { setPeek(true); send('peek', { on: true }); }
  }, true);
  document.addEventListener('keyup', function (e) { if (e.key === 'Shift') { setPeek(false); send('peek', { on: false }); } }, true);
  window.addEventListener('blur', function () { if (peek) { setPeek(false); send('peek', { on: false }); } });
  window.addEventListener('scroll', repositionAll, true);
  window.addEventListener('resize', repositionAll);

  window[MARK] = { serializeElement: serializeElement, repositionAll: repositionAll };

  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  send('ready');
})();
