#!/usr/bin/env node
/*
 * Infospector — optional file bridge.
 *
 * A zero-dependency Node server that persists notes to a JSON file on disk, so
 * an AI coding agent can read and edit review notes as a plain file (and flip
 * their state: open → reviewed → working → complete) while you leave them in
 * the browser. Without this, the tool stores notes in localStorage and works
 * exactly the same — the bridge only adds durable, file-based, agent-friendly
 * persistence.
 *
 * Run it from your project root:
 *     node public/labs/infospector/server.mjs
 *     node public/labs/infospector/server.mjs --port 7331 --file .infospector-notes.json
 *
 * Then open Infospector with the bridge pointed at it:
 *     /labs/infospector/index.html?bridge=http://localhost:7331&url=/your-page
 *
 * The notes file is a map of { "<pageKey>": { version, pageKey, targets: [...] } }.
 * Edit it by hand or with an agent; the browser polls and picks up changes.
 *
 * It answers CORS only for localhost/127.0.0.1/[::1] origins (echoed back, not `*`)
 * because it is a local dev helper bound to your machine; don't expose it on a
 * public interface.
 */
import http from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const PORT = Number(arg('port', process.env.INFOSPECTOR_PORT || 7331));
const FILE = path.resolve(process.cwd(), arg('file', process.env.INFOSPECTOR_FILE || 'infospector-notes.json'));

// ---- store ---------------------------------------------------------------
async function readStore() {
  try {
    if (!existsSync(FILE)) return {};
    const raw = await readFile(FILE, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('[infospector] could not read', FILE, '-', e.message);
    return {};
  }
}
async function writeStore(store) {
  await writeFile(FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');
}
function emptyDoc(pageKey) { return { version: 2, pageKey, targets: [] }; }

// ---- helpers -------------------------------------------------------------
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
function cors(res, req) {
  const origin = req && req.headers && req.headers.origin;
  if (origin) {
    try {
      const hostname = new URL(origin).hostname;
      if (LOCAL_HOSTNAMES.has(hostname)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    } catch (e) { /* malformed Origin: send no ACAO */ }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
}
function json(res, code, body, req) {
  cors(res, req);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// pageKeys become object-store keys; block prototype-pollution-prone values
const UNSAFE_PAGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ---- server --------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pageKey = u.searchParams.get('page') || '/';

  if (req.method === 'OPTIONS') { cors(res, req); res.writeHead(204); res.end(); return; }

  try {
    if (UNSAFE_PAGE_KEYS.has(pageKey)) { return json(res, 400, { error: 'invalid page key' }, req); }

    if (u.pathname === '/health') { return json(res, 200, { ok: true, file: FILE }, req); }

    if (u.pathname === '/rev') {
      cors(res, req);
      let rev = '0';
      try { const s = await stat(FILE); rev = String(Math.round(s.mtimeMs)); } catch (e) { /* no file yet */ }
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end(rev);
      return;
    }

    if (u.pathname === '/notes' && req.method === 'GET') {
      const store = await readStore();
      return json(res, 200, store[pageKey] || emptyDoc(pageKey), req);
    }

    if (u.pathname === '/notes' && req.method === 'PUT') {
      const body = await readBody(req);
      let doc;
      try { doc = JSON.parse(body); } catch (e) { return json(res, 400, { error: 'invalid JSON' }, req); }
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return json(res, 400, { error: 'expected a doc object' }, req);
      const store = await readStore();
      doc.pageKey = pageKey;
      store[pageKey] = doc;
      await writeStore(store);
      return json(res, 200, { ok: true, targets: Array.isArray(doc.targets) ? doc.targets.length : 0 }, req);
    }

    if (u.pathname === '/') {
      return json(res, 200, { name: 'infospector file bridge', file: FILE, endpoints: ['/health', '/notes?page=', '/rev?page='] }, req);
    }

    json(res, 404, { error: 'not found' }, req);
  } catch (e) {
    json(res, 500, { error: e.message }, req);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[infospector] file bridge on http://localhost:${PORT}`);
  console.log(`[infospector] notes file: ${FILE}`);
  console.log(`[infospector] open: /labs/infospector/index.html?bridge=http://localhost:${PORT}&url=/`);
});
