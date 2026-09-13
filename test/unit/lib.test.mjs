import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../lib.js';

test('radiusCss: browser windows round only the bottom; rulers square the left edge', () => {
  assert.equal(L.radiusCss({ shape: 'browser', r: 10 }, 1, false), '0 0 10px 10px');
  assert.equal(L.radiusCss({ shape: 'browser', r: 10 }, 1, true), '0 0 10px 0');
  assert.equal(L.radiusCss({ shape: 'device', r: 44 }, 0.5, false), '22px');
  assert.equal(L.radiusCss({ shape: 'device', r: 44 }, 0.5, true), '0 22px 22px 0');
});

test('tickSteps: minor ticks ≥6px, labeled ticks ≥60px, majors are multiples of minors', () => {
  for (const s of [0.25, 0.5, 0.74, 1, 2]) {
    const { minor, major } = L.tickSteps(s);
    assert.ok(minor * s >= 6, `minor at ${s}`);
    assert.ok(major * s >= 60, `major at ${s}`);
    assert.equal(major % minor, 0);
  }
  assert.deepEqual(L.tickSteps(1), { minor: 10, major: 100 });
});

test('normState: 3 states, legacy names map, junk → open', () => {
  assert.equal(L.normState('done'), 'done');
  assert.equal(L.normState('reviewed'), 'noted');
  assert.equal(L.normState('working'), 'noted');
  assert.equal(L.normState('complete'), 'done');
  assert.equal(L.normState('bogus'), 'open');
});

test('migrate: v1 flat notes become v2 targets grouped by selector, states normalized', () => {
  let i = 0; const uid = (p) => `${p}${++i}`;
  const v1 = { pageKey: '/', notes: [
    { id: 'n1', text: 'a', state: 'reviewed', anchor: { selector: '#x' }, element: { name: 'X' } },
    { id: 'n2', text: 'b', state: 'complete', anchor: { selector: '#x' } },
    { id: 'n3', text: 'c', state: 'open', element: { selectors: ['#y'] } },
  ] };
  const out = L.migrate(v1, uid);
  assert.equal(out.version, 2);
  assert.equal(out.targets.length, 2);
  assert.deepEqual(out.targets[0].notes.map((n) => n.state), ['noted', 'done']);
  assert.equal(out.targets[1].anchor.selector, '#y');
  // v2 passes through untouched apart from state names
  const v2 = { version: 2, pageKey: '/', targets: [{ id: 't', anchor: { selector: '#z' }, notes: [{ id: 'n', state: 'working' }] }] };
  assert.equal(L.migrate(v2, uid).targets[0].notes[0].state, 'noted');
});

test('parseRgb: hex (3/4/6/8), rgb(), hsl(), hsb(); garbage → null', () => {
  assert.deepEqual(L.parseRgb('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(L.parseRgb('#3c97ec'), { r: 60, g: 151, b: 236, a: 1 });
  assert.equal(L.parseRgb('#ffffff80').a, 0.502);
  assert.deepEqual(L.parseRgb('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(L.parseRgb('rgba(1, 2, 3, 0.5)'), { r: 1, g: 2, b: 3, a: 0.5 });
  assert.deepEqual(L.parseRgb('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(L.parseRgb('hsl(120, 100%, 25%)'), { r: 0, g: 128, b: 0, a: 1 });
  assert.equal(L.parseRgb('hsb(0, 100, 100)').r, 255);
  assert.equal(L.parseRgb('tomato'), null);
  assert.equal(L.parseRgb(''), null);
});

test('formatColor round-trips through hex / rgb / hsl / hsb', () => {
  assert.equal(L.formatColor('#3c97ec', 'hex'), '#3c97ec');
  assert.equal(L.formatColor('#3c97ec', 'rgb'), 'rgb(60, 151, 236)');
  assert.equal(L.formatColor('#3c97ec', 'hsl'), 'hsl(209, 82%, 58%)');
  assert.equal(L.formatColor('#3c97ec', 'hsb'), 'hsb(209, 75, 93)');
  assert.equal(L.formatColor('rgba(255, 255, 255, 0.55)', 'hsl'), 'hsla(0, 0%, 100%, 0.55)');
  assert.equal(L.formatColor('rgba(255, 255, 255, 0.55)', 'hex'), '#ffffff8c');
  assert.equal(L.toHex(L.formatColor('#3c97ec', 'hsl')), '#3c97ec');
});

test('parseColor: bare hex gets a #, hsb becomes hex, invalid → null', () => {
  assert.equal(L.parseColor('3c97ec'), '#3c97ec');
  assert.equal(L.parseColor('hsb(0, 100, 100)'), '#ff0000');
  assert.equal(L.parseColor('not a color'), null);
  assert.equal(L.parseColor('tomato', () => true), 'tomato');   // host passes CSS.supports
});

test('forTheme: a color picked in one theme is re-lit for the other, same hue', () => {
  assert.equal(L.forTheme('#1e3a8a', 'dark', 'dark'), '#1e3a8a');
  assert.equal(L.forTheme('#1e3a8a', null, 'light'), '#1e3a8a');          // untagged: used as-is
  assert.equal(L.forTheme('#1e3a8a', 'dark', 'light'), 'hsl(224, 64%, 90%)');
  assert.equal(L.hslOf(L.forTheme('#3c97ec', 'light', 'dark')).h, 209);
  assert.ok(L.hslOf(L.forTheme('#3c97ec', 'light', 'dark')).l <= 14);
});

test('contrast / lumOf / mixCss: WCAG numbers and the on-accent ink rule', () => {
  assert.equal(L.contrast('#000000', '#ffffff').toFixed(0), '21');
  assert.ok(L.contrast('#ffffff', '#4f8cff') >= 3, 'white passes 3:1 on the default blue');
  assert.ok(L.contrast('#ffffff', '#f7c948') < 3, 'white fails on yellow → dark ink');
  assert.equal(L.mixCss('#000000', '#ffffff', 0.5), '#808080');
  assert.ok(L.lumOf('#ffffff') > 0.99 && L.lumOf('#000000') < 0.01);
});

test('isUrlish / shortUrl', () => {
  assert.ok(L.isUrlish('/about') && L.isUrlish('https://x.test/a') && !L.isUrlish('about'));
  assert.equal(L.shortUrl('http://x.test/a?b=1', 'http://x.test'), '/a?b=1');
  assert.equal(L.shortUrl('http://x.test/', 'http://x.test'), '/');
  assert.equal(L.shortUrl('https://other.test/a', 'http://x.test'), 'https://other.test/a');
  assert.equal(L.shortUrl('nope', 'http://x.test'), 'nope');
});

test('pagePath: same-origin pages only; assets, APIs, framework internals and the tool itself are skipped', () => {
  const o = { origin: 'http://x.test', base: '/labs/infospector/' };
  assert.equal(L.pagePath('/about', o), '/about');
  assert.equal(L.pagePath('http://x.test/work/foo?x=1#h', o), '/work/foo');
  assert.equal(L.pagePath('//a//b', o), null);                       // protocol-relative → other origin
  assert.equal(L.pagePath('/a//b', o), '/a/b');
  assert.equal(L.pagePath('https://else.test/', o), null);
  assert.equal(L.pagePath('/logo.svg', o), null);
  assert.equal(L.pagePath('/api/projects', o), null);
  assert.equal(L.pagePath('/_next/static/x', o), null);
  assert.equal(L.pagePath('/labs/infospector/welcome.html', o), null);
  assert.equal(L.humanize('/case-studies/big_project'), 'Big Project');
  assert.equal(L.humanize('/'), 'Home');
});

test('mergePages: curated first and in order, then sitemap + learned links by path, de-duped', () => {
  const out = L.mergePages(
    [{ title: 'Home', path: '/', type: 'page' }, { title: 'About', path: '/about' }],
    [{ path: '/about' }, { path: '/zeta' }, { path: '/blog/post-one' }],
    { '/alpha': { title: 'Alpha!' }, '/zeta': { title: 'Z' }, '/': { title: 'ignored' } }
  );
  assert.deepEqual(out.map((p) => p.path), ['/', '/about', '/alpha', '/blog/post-one', '/zeta']);
  assert.equal(out[1].type, 'page');
  assert.equal(out[2].title, 'Alpha!'); assert.equal(out[2].type, 'link');
  assert.equal(out[3].title, 'Post One'); assert.equal(out[3].type, 'sitemap');
});
