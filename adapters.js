/*
 * Preview Tester — persistence adapters.
 *
 * One tiny interface, two implementations:
 *   - LocalStorageAdapter (default, zero-config)
 *   - FileBridgeAdapter   (optional: talks to server.mjs, which writes notes.json
 *                          to disk so an AI agent can read/edit notes as a file)
 *
 * A NotesDoc is: { version, pageKey, notes: Note[] }
 * Adapter interface:
 *   name
 *   async load(pageKey) -> NotesDoc
 *   async save(pageKey, doc) -> void
 *   subscribe(pageKey, cb)  -> unsubscribe fn   (fires when the doc changes elsewhere)
 */

var DOC_VERSION = 2;

export function emptyDoc(pageKey) {
  return { version: DOC_VERSION, pageKey: pageKey, targets: [] };
}

function isPlainDoc(doc) { return doc && typeof doc === 'object' && !Array.isArray(doc); }

/* ---------------- localStorage ---------------------------------------- */

class LocalStorageAdapter {
  constructor() { this.name = 'localStorage'; this.prefix = 'pt:notes:'; }

  key(pageKey) { return this.prefix + pageKey; }

  async load(pageKey) {
    try {
      var raw = localStorage.getItem(this.key(pageKey));
      if (!raw) return emptyDoc(pageKey);
      var doc = JSON.parse(raw);
      if (!isPlainDoc(doc)) return emptyDoc(pageKey);
      doc.pageKey = pageKey;
      return doc;
    } catch (e) { return emptyDoc(pageKey); }
  }

  async save(pageKey, doc) {
    try { localStorage.setItem(this.key(pageKey), JSON.stringify(doc)); } catch (e) { /* quota / private mode */ }
  }

  subscribe(pageKey, cb) {
    var self = this;
    function onStorage(e) { if (e.key === self.key(pageKey)) cb(); }
    window.addEventListener('storage', onStorage);
    return function () { window.removeEventListener('storage', onStorage); };
  }
}

/* ---------------- file bridge (optional) ------------------------------ */

class FileBridgeAdapter {
  constructor(base) { this.name = 'file bridge'; this.base = base.replace(/\/$/, ''); this.timer = null; }

  async load(pageKey) {
    try {
      var res = await fetch(this.base + '/notes?page=' + encodeURIComponent(pageKey), { cache: 'no-store' });
      if (!res.ok) return emptyDoc(pageKey);
      var doc = await res.json();
      if (!isPlainDoc(doc)) return emptyDoc(pageKey);
      return doc;
    } catch (e) { return emptyDoc(pageKey); }
  }

  async save(pageKey, doc) {
    try {
      await fetch(this.base + '/notes?page=' + encodeURIComponent(pageKey), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(doc)
      });
    } catch (e) { /* bridge went away */ }
  }

  subscribe(pageKey, cb) {
    // poll the bridge for out-of-band edits (e.g. an agent editing notes.json)
    var self = this, last = null, stopped = false;
    async function tick() {
      if (stopped) return;
      try {
        var res = await fetch(self.base + '/rev?page=' + encodeURIComponent(pageKey), { cache: 'no-store' });
        if (res.ok) { var r = await res.text(); if (last !== null && r !== last) cb(); last = r; }
      } catch (e) { /* ignore */ }
      self.timer = setTimeout(tick, 2000);
    }
    tick();
    return function () { stopped = true; if (self.timer) clearTimeout(self.timer); };
  }
}

/* ---------------- resolver -------------------------------------------- */

/*
 * Pick an adapter. A file bridge is used only when explicitly pointed at one
 * (via ?bridge=<url> or window.INFOSPECTOR_BRIDGE) AND it answers a health probe.
 * Otherwise falls back to localStorage. Never blocks the UI for long.
 */
export async function resolveStore() {
  var bridge = null;
  try {
    var params = new URLSearchParams(location.search);
    bridge = params.get('bridge') || (typeof window !== 'undefined' && (window.INFOSPECTOR_BRIDGE || window.PT_BRIDGE)) || null;
  } catch (e) { /* ignore */ }

  if (bridge) {
    try {
      var ctrl = new AbortController();
      var t = setTimeout(function () { ctrl.abort(); }, 1200);
      var res = await fetch(bridge.replace(/\/$/, '') + '/health', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return new FileBridgeAdapter(bridge);
    } catch (e) { /* fall through to localStorage */ }
  }
  return new LocalStorageAdapter();
}
