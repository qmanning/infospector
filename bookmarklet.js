/*
 * Infospector — bookmarklet inspector (standalone, no stage, no notes).
 * Paste-anywhere vanilla JS overlay. Shift+click an element to get a
 * plain-text description precise enough for an AI coding assistant to
 * find the element (and its React component) without guessing.
 *
 * Bookmarklet (drag to bookmarks bar, or paste into the address bar):
 *
 * javascript:(()=>{const s=document.createElement('script');s.src=location.origin+'/labs/infospector/bookmarklet.js?t='+Date.now();document.body.appendChild(s)})()
 */
(function () {
  'use strict';

  // ---- double-injection guard -------------------------------------------
  if (typeof window !== 'undefined' && window.__qmPreviewTester) {
    return;
  }

  // ---- small pure helpers -------------------------------------------------

  function collapseWhitespace(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function roundRect(r) {
    return { x: round1(r.x), y: round1(r.y), width: round1(r.width), height: round1(r.height) };
  }

  function cssEscape(str) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
    return String(str).replace(/([^\w-])/g, '\\$1');
  }

  function getAttrs(el) {
    var attrs = {};
    var role = el.getAttribute('role');
    if (role) attrs.role = role;
    var testid = el.getAttribute('data-testid');
    if (testid) attrs['data-testid'] = testid;
    var list = el.attributes || [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.name.indexOf('data-') === 0) attrs[a.name] = a.value;
    }
    ['href', 'src', 'alt'].forEach(function (k) {
      if (el.hasAttribute && el.hasAttribute(k)) attrs[k] = el.getAttribute(k);
    });
    return attrs;
  }

  function getStyleSnapshot(el, win) {
    var w = win || (typeof window !== 'undefined' ? window : null);
    var cs = w.getComputedStyle(el);
    return {
      borderRadius: cs.borderRadius,
      padding: cs.padding,
      margin: cs.margin,
      fontSize: cs.fontSize,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      display: cs.display,
      position: cs.position
    };
  }

  function isUniqueSelector(doc, sel, el) {
    try {
      var nodes = doc.querySelectorAll(sel);
      return nodes.length === 1 && nodes[0] === el;
    } catch (e) {
      return false;
    }
  }

  function nthOfTypeSelector(el) {
    var tag = el.tagName.toLowerCase();
    var parent = el.parentElement;
    if (!parent) return tag;
    var siblings = Array.prototype.filter.call(parent.children, function (c) {
      return c.tagName === el.tagName;
    });
    var idx = siblings.indexOf(el) + 1;
    return tag + ':nth-of-type(' + idx + ')';
  }

  function buildCssPath(el, doc) {
    var segments = [];
    var node = el;
    var root = null;
    while (node && node.nodeType === 1) {
      if (node !== el) {
        var id = node.getAttribute('id');
        if (id) {
          var idSel = '#' + cssEscape(id);
          if (isUniqueSelector(doc, idSel, node)) {
            root = idSel;
            break;
          }
        }
        var testid = node.getAttribute('data-testid');
        if (testid) {
          var tidSel = '[data-testid="' + testid.replace(/"/g, '\\"') + '"]';
          if (isUniqueSelector(doc, tidSel, node)) {
            root = tidSel;
            break;
          }
        }
      }
      if (node.tagName === 'BODY') {
        root = 'body';
        break;
      }
      segments.unshift(nthOfTypeSelector(node));
      node = node.parentElement;
    }
    if (!root) root = 'body';
    return root + (segments.length ? ' > ' + segments.join(' > ') : '');
  }

  function getSelectors(el, doc) {
    var d = doc || el.ownerDocument;
    var list = [];
    var id = el.getAttribute('id');
    if (id) {
      var idSel = '#' + cssEscape(id);
      if (isUniqueSelector(d, idSel, el)) list.push(idSel);
    }
    var testid = el.getAttribute('data-testid');
    if (testid) {
      var tidSel = '[data-testid="' + testid.replace(/"/g, '\\"') + '"]';
      if (isUniqueSelector(d, tidSel, el)) list.push(tidSel);
    }
    var pathSel = buildCssPath(el, d);
    if (list.indexOf(pathSel) === -1) {
      if (isUniqueSelector(d, pathSel, el) || !list.length) list.push(pathSel);
    }
    return list;
  }

  function findFiberKey(el) {
    for (var k in el) {
      if (Object.prototype.hasOwnProperty.call(el, k) && k.indexOf('__reactFiber') === 0) return k;
    }
    return null;
  }

  function shouldSkipComponentName(name) {
    if (!name) return true;
    if (name === 'Fragment' || name === 'Suspense' || name === 'Provider') return true;
    if (/^[a-z_]/.test(name)) return true;
    return false;
  }

  function getReactComponents(el) {
    var node = el;
    var fiber = null;
    while (node) {
      var key = findFiberKey(node);
      if (key) {
        fiber = node[key];
        break;
      }
      node = node.parentElement;
    }
    if (!fiber) return [];
    var names = [];
    var f = fiber;
    while (f) {
      var type = f.type;
      if (typeof type === 'function') {
        var name = type.displayName || type.name;
        if (!shouldSkipComponentName(name)) {
          if (names[names.length - 1] !== name) names.push(name);
        }
      }
      f = f.return;
      if (names.length >= 8) break;
    }
    return names.slice(0, 8);
  }

  function getLineage(el) {
    var result = [];
    var node = el.parentElement;
    while (node && result.length < 3) {
      var tag = node.tagName.toLowerCase();
      var cls = node.classList && node.classList.length ? node.classList[0] : null;
      result.push(cls ? tag + '.' + cls : tag);
      node = node.parentElement;
    }
    return result;
  }

  function getPageInfo(win, doc) {
    var w = win || window;
    var d = doc || document;
    return {
      url: w.location.href,
      path: w.location.pathname,
      title: d.title,
      viewport: { w: w.innerWidth, h: w.innerHeight },
      dpr: w.devicePixelRatio || 1,
      capturedAt: new Date().toISOString()
    };
  }

  // ---- the two testable "pure-ish" functions -------------------------------

  function serializeElement(el, opts) {
    opts = opts || {};
    var doc = opts.doc || el.ownerDocument || (typeof document !== 'undefined' ? document : null);
    var win = opts.win || (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
    var id = el.getAttribute('id') || null;
    var classes = el.classList ? Array.prototype.slice.call(el.classList) : [];
    var textRaw = el.textContent || '';
    var collapsedText = collapseWhitespace(textRaw);
    var name =
      el.getAttribute('aria-label') ||
      el.getAttribute('data-testid') ||
      (collapsedText ? collapsedText.slice(0, 80) : '') ||
      el.tagName.toLowerCase();
    var rect = el.getBoundingClientRect();

    return {
      tag: el.tagName.toLowerCase(),
      id: id,
      classes: classes,
      name: name,
      attrs: getAttrs(el),
      text: collapsedText.slice(0, 160),
      rect: roundRect(rect),
      style: getStyleSnapshot(el, win),
      selectors: getSelectors(el, doc),
      components: getReactComponents(el),
      lineage: getLineage(el),
      page: getPageInfo(win, doc)
    };
  }

  function fmtLine(label, value) {
    return '  ' + (label + ':').padEnd(13) + value;
  }

  function formatPayload(data) {
    var d = data || {};
    var name = d.name || '';
    var components = d.components && d.components.length ? d.components.join(' › ') : '(none)';
    var selectors = d.selectors || [];
    var best = selectors[0] || '(none)';
    var fallbacks = selectors.slice(1).length ? selectors.slice(1).join(', ') : '(none)';
    var tag = d.tag || '';
    var idPart = d.id ? '#' + d.id : '(no id)';
    var classes = d.classes && d.classes.length ? d.classes.join(' ') : '(none)';
    var rect = d.rect || {};
    var style = d.style || {};
    var text = d.text || '';
    var lineage = d.lineage && d.lineage.length ? d.lineage.join(' › ') : '(none)';
    var page = d.page || {};
    var viewport = page.viewport || {};

    var lines = [];
    lines.push('ELEMENT');
    lines.push(fmtLine('name', name));
    lines.push(fmtLine('components', components));
    lines.push(fmtLine('selector', best));
    lines.push(fmtLine('fallbacks', fallbacks));
    lines.push(fmtLine('tag/id', tag + ' ' + idPart + ' · classes: ' + classes));
    lines.push(
      fmtLine(
        'size',
        rect.width + ' × ' + rect.height + '   radius: ' + (style.borderRadius || '') +
          '   padding: ' + (style.padding || '') + '   margin: ' + (style.margin || '')
      )
    );
    lines.push(fmtLine('text', '"' + text + '"'));
    lines.push(fmtLine('lineage', lineage));
    lines.push('PAGE');
    lines.push(fmtLine('title', page.title || ''));
    lines.push(fmtLine('url', page.url || ''));
    lines.push(
      fmtLine('viewport', (viewport.w != null ? viewport.w : '') + ' × ' + (viewport.h != null ? viewport.h : '') + '   dpr: ' + (page.dpr != null ? page.dpr : ''))
    );
    lines.push(fmtLine('captured', page.capturedAt || ''));
    return lines.join('\n');
  }

  // ---- unload (defined at module scope so it works with/without an active UI) --

  var uiState = null;

  function unload() {
    if (uiState) {
      try {
        document.removeEventListener('click', uiState.onClick, true);
        document.removeEventListener('keydown', uiState.onKeyDown, true);
        window.removeEventListener('scroll', uiState.reposition, true);
        window.removeEventListener('resize', uiState.reposition);
        if (uiState.root && uiState.root.parentNode) uiState.root.parentNode.removeChild(uiState.root);
      } catch (e) {
        /* no-op */
      }
      uiState = null;
    }
    if (typeof window !== 'undefined') {
      try {
        delete window.__qmPreviewTester;
      } catch (e) {
        window.__qmPreviewTester = undefined;
      }
    }
  }

  // ---- expose testable surface immediately --------------------------------

  if (typeof window !== 'undefined') {
    window.__qmPreviewTester = { serializeElement: serializeElement, formatPayload: formatPayload, unload: unload };
  }

  // ---- DOM/UI wiring (only runs in a real document) -----------------------

  function init() {
    var root = document.createElement('div');
    root.id = 'qm-pt-root';
    root.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;pointer-events:none;';

    var outline = document.createElement('div');
    outline.style.cssText =
      'position:fixed;box-sizing:border-box;border:1px solid #4f8cff;background:rgba(79,140,255,0.10);' +
      'pointer-events:none;display:none;z-index:2147483000;';
    root.appendChild(outline);

    var card = document.createElement('div');
    card.style.cssText =
      'position:fixed;display:none;pointer-events:auto;background:#1b1d23;color:#f2f3f5;' +
      'font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'padding:10px 12px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.35);max-width:340px;' +
      'z-index:2147483000;';
    root.appendChild(card);

    var hud = document.createElement('div');
    hud.style.cssText =
      'position:fixed;right:12px;bottom:12px;pointer-events:auto;background:#1b1d23;color:#f2f3f5;' +
      'font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'padding:6px 10px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;' +
      'align-items:center;gap:8px;z-index:2147483000;';
    var hudText = document.createElement('span');
    hudText.textContent = 'Infospector · shift+click to inspect · Esc';
    var hudClose = document.createElement('button');
    hudClose.textContent = '×';
    hudClose.setAttribute('aria-label', 'Close Infospector');
    hudClose.style.cssText =
      'pointer-events:auto;background:transparent;border:none;color:#f2f3f5;font-size:14px;' +
      'line-height:1;cursor:pointer;padding:0 2px;';
    hudClose.addEventListener('click', function () {
      unload();
    });
    hud.appendChild(hudText);
    hud.appendChild(hudClose);
    root.appendChild(hud);

    document.body.appendChild(root);

    var currentSelection = null;
    var lastClickTarget = null;

    function makeButton(label) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        'pointer-events:auto;background:#2b2e37;color:#f2f3f5;border:1px solid #3d4150;' +
        'border-radius:5px;padding:4px 8px;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",' +
        'Roboto,Helvetica,Arial,sans-serif;cursor:pointer;';
      return b;
    }

    function fallbackCopy(text, cb) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (cb) cb();
      } catch (e) {
        /* no-op */
      }
    }

    function copyText(text, btn) {
      var original = btn.textContent;
      function flash() {
        btn.textContent = 'Copied';
        setTimeout(function () {
          btn.textContent = original;
        }, 1200);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flash, function () {
          fallbackCopy(text, flash);
        });
      } else {
        fallbackCopy(text, flash);
      }
    }

    function row(label, value) {
      var r = document.createElement('div');
      r.style.cssText = 'margin:2px 0;word-break:break-word;';
      var strong = document.createElement('b');
      strong.style.cssText = 'color:#9fb4ff;margin-right:4px;';
      strong.textContent = label + ':';
      r.appendChild(strong);
      var span = document.createElement('span');
      span.textContent = value;
      r.appendChild(span);
      return r;
    }

    function renderCard(data) {
      card.innerHTML = '';
      var title = document.createElement('div');
      title.style.cssText = 'font-weight:600;margin-bottom:4px;font-size:12.5px;color:#ffffff;';
      title.textContent = data.name;
      card.appendChild(title);

      var componentsText = data.components && data.components.length ? data.components.join(' › ') : '(none)';
      card.appendChild(row('components', componentsText));
      card.appendChild(row('size', Math.round(data.rect.width) + ' × ' + Math.round(data.rect.height)));
      card.appendChild(row('radius', data.style.borderRadius));
      card.appendChild(row('padding', data.style.padding));
      var best = (data.selectors && data.selectors[0]) || '(none)';
      card.appendChild(row('selector', best));

      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'margin-top:8px;display:flex;gap:6px;';
      var copyBtn = makeButton('Copy');
      var copyJsonBtn = makeButton('Copy JSON');
      copyBtn.addEventListener('click', function () {
        copyText(formatPayload(data), copyBtn);
      });
      copyJsonBtn.addEventListener('click', function () {
        copyText(JSON.stringify(data, null, 2), copyJsonBtn);
      });
      btnRow.appendChild(copyBtn);
      btnRow.appendChild(copyJsonBtn);
      card.appendChild(btnRow);
    }

    function positionOutline(el) {
      var r = el.getBoundingClientRect();
      outline.style.left = r.left + 'px';
      outline.style.top = r.top + 'px';
      outline.style.width = r.width + 'px';
      outline.style.height = r.height + 'px';
      outline.style.display = 'block';
    }

    function positionCard(el) {
      var r = el.getBoundingClientRect();
      card.style.display = 'block';
      var cw = card.offsetWidth;
      var ch = card.offsetHeight;
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var left = r.left;
      var top = r.bottom + 8;
      if (top + ch > vh) top = Math.max(8, r.top - ch - 8);
      if (left + cw > vw) left = Math.max(8, vw - cw - 8);
      if (left < 8) left = 8;
      card.style.left = left + 'px';
      card.style.top = top + 'px';
    }

    function selectElement(el) {
      currentSelection = el;
      var data = serializeElement(el);
      renderCard(data);
      positionOutline(el);
      positionCard(el);
    }

    function dismiss() {
      currentSelection = null;
      outline.style.display = 'none';
      card.style.display = 'none';
    }

    function getDeepTargetAtPoint(x, y) {
      var stack = document.elementsFromPoint(x, y);
      for (var i = 0; i < stack.length; i++) {
        var el = stack[i];
        if (el !== root && !root.contains(el)) return el;
      }
      return null;
    }

    function onClick(e) {
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      var target = getDeepTargetAtPoint(e.clientX, e.clientY);
      if (!target || target === document.body || target === document.documentElement) {
        dismiss();
        lastClickTarget = null;
        return;
      }
      if (target === lastClickTarget && currentSelection) {
        var parent = currentSelection.parentElement;
        var next = currentSelection === document.body || !parent ? document.body : parent;
        selectElement(next);
      } else {
        lastClickTarget = target;
        selectElement(target);
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        dismiss();
        lastClickTarget = null;
      }
    }

    function reposition() {
      if (!currentSelection || !document.body.contains(currentSelection)) return;
      positionOutline(currentSelection);
      positionCard(currentSelection);
    }

    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    uiState = { root: root, onClick: onClick, onKeyDown: onKeyDown, reposition: reposition };
  }

  if (typeof document !== 'undefined') {
    init();
  }
})();
