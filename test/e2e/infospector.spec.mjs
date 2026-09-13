// End-to-end: the tool served from test/serve.mjs, reviewing its own welcome page (same origin).
import { test, expect } from '@playwright/test';

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(async ({ page }) => {
  // skip the first-run card; every test starts with a clean browser context anyway
  await page.addInitScript(() => { try { localStorage.setItem('pt:setup', '1'); } catch (e) { /* ignore */ } });
  await page.goto('/index.html');
  await expect(page.locator('#pt-omni-input')).toHaveValue(/welcome\.html$/);
  await page.frameLocator('#pt-frame').locator('h1').waitFor();
});

const frame = (page) => page.frameLocator('#pt-frame');
// the stage may be scaled to fit; convert page px → the tool's logical px
const stageInfo = async (page) => page.evaluate(() => { const v = document.getElementById('pt-stage-viewport'); const r = v.getBoundingClientRect(); return { x: r.x, y: r.y, s: new DOMMatrix(getComputedStyle(v).transform).a || 1 }; });
const logical = (st, px, py) => ({ x: Math.round((px - st.x) / st.s), y: Math.round((py - st.y) / st.s) });
const inspectOn = async (page) => { await page.click('#pt-inspect'); await expect(page.locator('#pt-inspect')).toHaveAttribute('aria-pressed', 'true'); await page.waitForTimeout(400); };
// click the card's padding: the tool selects the deepest element under the pointer, and the middle is its <p>
const selectCard = async (page) => { await frame(page).locator('.card').first().click({ position: { x: 6, y: 6 } }); await expect(page.locator('#pt-selbox')).toBeVisible(); await expect(page.locator('#pt-sb-name')).toContainText('A card'); };

test('boots to the welcome page and the doctor finds nothing broken', async ({ page }) => {
  const report = await page.evaluate(() => window.__infospector.doctor());
  expect(report.filter((c) => c.status === 'fail')).toEqual([]);
  expect(report.find((c) => c.name === 'Inspector injected').status).toBe('ok');
});

test('⌘K focuses the search; typing a path loads it on the stage', async ({ page }) => {
  await page.keyboard.press(`${MOD}+KeyK`);
  await expect(page.locator('#pt-omni-input')).toBeFocused();
  await expect(page.locator('.pt-omni-hint')).toHaveText('Copy Paste URL to Load on Stage');
  await page.fill('#pt-omni-input', '/welcome.html?from=test');
  await page.keyboard.press('Enter');
  await expect(page.locator('#pt-omni-input')).toHaveValue(/from=test$/);
});

test('inspect → select an element → Item Info with click-to-copy fields', async ({ page, context }) => {
  await inspectOn(page); await selectCard(page);
  await expect(page.locator('#pt-sb-sel')).toContainText('body >');
  await page.click('#pt-sb-sel');
  await expect(page.locator('#pt-tip')).toHaveText('Copied');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(/^body > /);
});

test('a note is a draft until saved, then persists across reload with its identity block', async ({ page }) => {
  await inspectOn(page); await selectCard(page);
  await page.click('#pt-add-note');
  const ta = page.locator('.pt-modal textarea');
  await ta.fill('Tighten the padding');
  expect(await page.evaluate(() => window.__infospector.listNotes().length)).toBe(0);   // draft
  await ta.press(`${MOD}+Enter`);
  await expect(page.locator('#pt-toast')).toHaveText('Note saved');
  await page.reload();
  await frame(page).locator('h1').waitFor();
  await expect(page.locator('#pt-menu-btn .pt-badge')).toHaveText('1');
  const text = await page.evaluate(() => window.__infospector.allNotesText());
  expect(text).toContain('Tighten the padding');
  expect(text).toMatch(/selector: body > /);
});

test('Ruler wrap snaps four guides to the element; the wrap button is not a toggle', async ({ page }) => {
  await inspectOn(page); await selectCard(page);
  const box = await frame(page).locator('.card').first().boundingBox();
  const st = await stageInfo(page);
  await page.click('#pt-ruler');
  await expect(page.locator('#pt-guides .pt-guide')).toHaveCount(4);
  const labels = (await page.locator('#pt-guides .pt-guide-label').allTextContents()).map((t) => Number(t.replace(/^[XY]:\s*/, ''))).sort((a, b) => a - b);
  const tl = logical(st, box.x, box.y), br = logical(st, box.x + box.width, box.y + box.height);
  const want = [tl.x, br.x, tl.y, br.y].sort((a, b) => a - b);
  labels.forEach((l, i) => expect(Math.abs(l - want[i])).toBeLessThanOrEqual(1));
  expect(await page.getAttribute('#pt-ruler', 'aria-pressed')).toBeNull();
});

test('a dragged guide snaps to an element edge and remembers it', async ({ page }) => {
  await inspectOn(page);
  const card = await frame(page).locator('.card').first().boundingBox();
  const ruler = await page.locator('#pt-ruler-left').boundingBox();
  await page.mouse.move(ruler.x + 10, card.y + 40);
  await page.mouse.down();
  await page.waitForTimeout(250);                                   // the frame answers the snap-line request
  await page.mouse.move(card.x - 3, card.y + 40, { steps: 6 });
  await page.mouse.up();
  const guides = await page.evaluate(() => JSON.parse(localStorage.getItem('pt:guides:/welcome.html')));
  expect(guides).toHaveLength(1);
  const st = await stageInfo(page);
  expect(guides[0].pos).toBe(logical(st, card.x, 0).x);
  expect(guides[0].snap.edge).toBe('left');
});

test('selected guide: purple menu, click-off deselects, Delete removes it', async ({ page }) => {
  await inspectOn(page); await selectCard(page);
  await page.click('#pt-ruler');
  const guide = page.locator('#pt-guides .pt-guide.pt-y').first();
  const g = await guide.boundingBox();                              // the 7px-tall hit strip around the line
  await page.mouse.click(g.x + 300, g.y + 3);
  await expect(page.locator('#pt-gbox')).toBeVisible();
  await expect(page.locator('#pt-guides .pt-guide.pt-selected')).toHaveCount(1);
  await frame(page).locator('main').click({ position: { x: 5, y: 5 } });   // into the page (no scroll) → deselect
  await expect(page.locator('#pt-gbox')).toBeHidden();
  const g2 = await guide.boundingBox();
  await page.mouse.click(g2.x + 300, g2.y + 3);
  await expect(page.locator('#pt-gbox')).toBeVisible();             // selecting again after the page had focus still works
  await page.keyboard.press('Delete');
  await expect(page.locator('#pt-guides .pt-guide')).toHaveCount(3);
});

test('⌘-hover between two guides reads the distance; clicking it makes a guide with the note', async ({ page }) => {
  await inspectOn(page); await selectCard(page);
  await page.click('#pt-ruler');
  const card = await frame(page).locator('.card').first().boundingBox();
  const st = await stageInfo(page);
  const h = logical(st, 0, card.y + card.height).y - logical(st, 0, card.y).y;
  await page.keyboard.down(MOD);
  await page.mouse.move(card.x + 20, card.y + card.height / 2, { steps: 3 });
  const tag = page.locator('#pt-gaps .pt-gap').first();
  await expect(tag).toHaveText(`Y: ${h}px`);
  await tag.click();
  await page.keyboard.up(MOD);
  await expect(page.locator('#pt-guides .pt-guide')).toHaveCount(5);
  await expect(page.locator('#pt-guides .pt-guide-label').filter({ hasText: '·' })).toHaveText(new RegExp(`· ${h}px`));
  await page.locator('.pt-modal textarea').fill('Even this out');
  await page.locator('.pt-modal textarea').press(`${MOD}+Enter`);
  const text = await page.evaluate(() => window.__infospector.allNotesText());
  expect(text).toMatch(/measures: \d+px between horizontal guides/);
  await expect(page.locator('#pt-guides .pt-guide-pin')).toHaveText('1');
});

test('Clear all notes asks first, then clears', async ({ page }) => {
  await inspectOn(page); await selectCard(page);
  await page.click('#pt-add-note');
  await page.locator('.pt-modal textarea').fill('x');
  await page.locator('.pt-modal textarea').press(`${MOD}+Enter`);
  await page.click('#pt-menu-btn');
  await page.click('#pt-clear');
  await expect(page.locator('#pt-confirm')).toBeVisible();
  await page.click('#pt-confirm-cancel');
  expect(await page.evaluate(() => window.__infospector.listNotes().length)).toBe(1);
  await page.click('#pt-menu-btn'); await page.click('#pt-clear'); await page.click('#pt-confirm-ok');
  await expect(page.locator('#pt-toast')).toHaveText('Notes cleared');
  expect(await page.evaluate(() => window.__infospector.listNotes().length)).toBe(0);
});

test('shortcuts list opens from the button and from "?"', async ({ page }) => {
  await page.click('#pt-keys-btn');
  await expect(page.locator('#pt-keys-pop')).toHaveClass(/pt-open/);
  await expect(page.locator('#pt-keys-pop dd')).toHaveCount(15);
  await page.click('#pt-keys-btn');
  await page.keyboard.press('Shift+?');
  await expect(page.locator('#pt-keys-pop')).toHaveClass(/pt-open/);
});
