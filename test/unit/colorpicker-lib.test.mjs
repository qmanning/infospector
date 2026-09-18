// Unit tests for the lib.js color helpers the glass color picker (colorpicker.js) depends on.
// These extend test/unit/lib.test.mjs with cases not already covered there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../lib.js';

test('parseRgb: 4-digit hex (#rgba) expands and carries alpha', () => {
  assert.deepEqual(L.parseRgb('#fff8'), { r: 255, g: 255, b: 255, a: +(0x88 / 255).toFixed(3) });
  assert.deepEqual(L.parseRgb('#000f'), { r: 0, g: 0, b: 0, a: 1 });
});

test('parseRgb: rgba() with a percentage alpha', () => {
  assert.deepEqual(L.parseRgb('rgba(10, 20, 30, 50%)'), { r: 10, g: 20, b: 30, a: 0.5 });
});

test('parseRgb: hsla() with alpha (fraction and percentage) and hsb()/hsv() spellings', () => {
  assert.deepEqual(L.parseRgb('hsla(0, 100%, 50%, 0.25)'), { r: 255, g: 0, b: 0, a: 0.25 });
  assert.deepEqual(L.parseRgb('hsla(0, 100%, 50%, 50%)'), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.equal(L.parseRgb('hsv(120, 100, 100)').g, 255);
  assert.equal(L.parseRgb('hsb(240, 50, 50)').b, 128);
});

test('parseRgb: whitespace/case tolerant, garbage and empty stay null', () => {
  assert.deepEqual(L.parseRgb('  #FFF  '), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(L.parseRgb('RGB(1,2,3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.equal(L.parseRgb(null), null);
  assert.equal(L.parseRgb('notacolor(1,2,3)'), null);
});

test('hsbToHex: primaries, black/white, and out-of-range hue wraps', () => {
  assert.equal(L.hsbToHex(0, 100, 100), '#ff0000');
  assert.equal(L.hsbToHex(120, 100, 100), '#00ff00');
  assert.equal(L.hsbToHex(240, 100, 100), '#0000ff');
  assert.equal(L.hsbToHex(0, 0, 0), '#000000');
  assert.equal(L.hsbToHex(0, 0, 100), '#ffffff');
  assert.equal(L.hsbToHex(360, 100, 100), L.hsbToHex(0, 100, 100));
});

test('toHex: passes through already-hex colors and normalizes rgb()/hsl() input', () => {
  assert.equal(L.toHex('#3c97ec'), '#3c97ec');
  assert.equal(L.toHex('rgb(60, 151, 236)'), '#3c97ec');
  assert.equal(L.toHex('hsl(209, 82%, 58%)'), '#3c97ec');
  // alpha is dropped by toHex (it only reads r/g/b off rgbOf)
  assert.equal(L.toHex('rgba(255, 0, 0, 0.5)'), '#ff0000');
});

test('toHex: an unrecognized string with no colorFallback installed resolves to black', () => {
  assert.equal(L.toHex('not-a-real-color'), '#000000');
});

test('rgbOf: mirrors parseRgb for parseable input, and falls back to opaque black otherwise', () => {
  assert.deepEqual(L.rgbOf('#112233'), { r: 17, g: 34, b: 51, a: 1 });
  assert.deepEqual(L.rgbOf('garbage'), { r: 0, g: 0, b: 0, a: 1 });
});

test('formatColor: hex format includes an alpha byte only when a < 1', () => {
  assert.equal(L.formatColor('#3c97ec', 'hex'), '#3c97ec');
  assert.equal(L.formatColor('rgba(60, 151, 236, 0.5)', 'hex'), '#3c97ec80');
});

test('formatColor: rgb format switches to rgba(...) only when a < 1', () => {
  assert.equal(L.formatColor('#000000', 'rgb'), 'rgb(0, 0, 0)');
  assert.equal(L.formatColor('rgba(0, 0, 0, 0.3)', 'rgb'), 'rgba(0, 0, 0, 0.3)');
});

test('formatColor: hsl format switches to hsla(...) only when a < 1; grayscale has 0% saturation', () => {
  assert.equal(L.formatColor('#808080', 'hsl'), 'hsl(0, 0%, 50%)');
  assert.equal(L.formatColor('rgba(255, 0, 0, 0.4)', 'hsl'), 'hsla(0, 100%, 50%, 0.4)');
});

test('formatColor: hsb format ignores alpha (no hsba variant) and reports 0 saturation for gray', () => {
  assert.equal(L.formatColor('#000000', 'hsb'), 'hsb(0, 0, 0)');
  assert.equal(L.formatColor('#808080', 'hsb'), 'hsb(0, 0, 50)');
  assert.equal(L.formatColor('rgba(60, 151, 236, 0.4)', 'hsb'), 'hsb(209, 75, 93)');
});

test('formatColor: unknown/omitted fmt falls back to the hex branch', () => {
  assert.equal(L.formatColor('#3c97ec', 'nope'), '#3c97ec');
  assert.equal(L.formatColor('#3c97ec'), '#3c97ec');
});

test('parseColor: hsb()/hsv() input becomes hex regardless of the isValid predicate', () => {
  assert.equal(L.parseColor('hsv(120, 100, 100)'), '#00ff00');
});

test('parseColor: 3-digit bare hex also gets a leading #', () => {
  assert.equal(L.parseColor('fff'), '#fff');
});

test('parseColor: blank/whitespace-only input is null without calling isValid', () => {
  assert.equal(L.parseColor(''), null);
  assert.equal(L.parseColor('   '), null);
  assert.equal(L.parseColor(undefined), null);
});

test('parseColor: default isValid rejects anything parseRgb rejects, e.g. named colors', () => {
  assert.equal(L.parseColor('tomato'), null);           // no CSS.supports fallback in this default
  assert.equal(L.parseColor('rgb(1,2,3)'), 'rgb(1,2,3)'); // passes default isValid via parseRgb
});
