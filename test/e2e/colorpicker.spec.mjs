// End-to-end: the glass color picker (colorpicker.js) is a real glass surface and stays live.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // skip the first-run card; every test starts with a clean browser context anyway
  await page.addInitScript(() => { try { localStorage.setItem('pt:setup', '1'); localStorage.setItem('pt:startsize', 'fit'); } catch (e) { /* ignore */ } });
  await page.goto('/index.html');
  // belt-and-suspenders: dismiss the first-run sheet if it still shows up
  const setup = page.locator('#pt-setup');
  if (await setup.isVisible().catch(() => false)) await page.click('#pt-setup-skip');
  await page.frameLocator('#pt-frame').locator('h1').waitFor();
});

// right-click an empty corner of the stage (not the framed page) to open the Background context menu
const openCtx = async (page) => {
  const wrap = await page.locator('#pt-stagewrap').boundingBox();
  await page.mouse.click(wrap.x + 12, wrap.y + wrap.height / 2, { button: 'right' });
  await expect(page.locator('#pt-ctx')).toBeVisible();
};

const openPicker = async (page, swatchSelector) => {
  await openCtx(page);
  await page.click(swatchSelector);
  const picker = page.locator('.pt-cpick');
  await expect(picker).toHaveClass(/pt-open/);
  return picker;
};

// drag from one corner of the saturation/value square to the other so hue/sat/val all actually move
const dragSv = async (page) => {
  const sv = await page.locator('.pt-cp-sv').boundingBox();
  await page.mouse.move(sv.x + sv.width * 0.2, sv.y + sv.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(sv.x + sv.width * 0.85, sv.y + sv.height * 0.85, { steps: 6 });
  await page.mouse.up();
};

test('clicking the Background swatch opens the color picker', async ({ page }) => {
  const picker = await openPicker(page, '#pt-col-ground');
  await expect(picker).toBeVisible();
});

test('dragging in the saturation square live-updates --pt-ground and the text field', async ({ page }) => {
  await openPicker(page, '#pt-col-ground');
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pt-ground').trim());
  const textBefore = await page.locator('#pt-col-ground-txt').inputValue();
  await dragSv(page);
  await expect(page.locator('.pt-cpick')).toHaveClass(/pt-open/);   // still open — this is a live drag, not a commit-and-close
  const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pt-ground').trim());
  expect(after).not.toBe(before);
  await expect(page.locator('#pt-col-ground-txt')).not.toHaveValue(textBefore);
});

test('dragging the glass tint picker live-updates --c-glass', async ({ page }) => {
  await openCtx(page);
  await page.click('#pt-ap-toggle');
  await expect(page.locator('#pt-ap-pop')).toHaveClass(/pt-open/);
  await page.click('#pt-ap-color');
  const picker = page.locator('.pt-cpick');
  await expect(picker).toHaveClass(/pt-open/);
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-glass').trim());
  await dragSv(page);
  const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-glass').trim());
  expect(after).not.toBe(before);
});

test('the picker is a glass surface: gradient backing, follows the Radius dial, and matches #pt-ctx', async ({ page }) => {
  const picker = await openPicker(page, '#pt-col-ground');
  const bg = await picker.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('gradient');
  const radiusBefore = await picker.evaluate((el) => getComputedStyle(el).borderRadius);
  expect(radiusBefore).toBe('40px');
  // close the picker (Escape) before reaching the Radius dial behind it, then reopen Material & Light
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await page.click('#pt-ap-toggle');
  await expect(page.locator('#pt-ap-pop')).toHaveClass(/pt-open/);
  await page.evaluate(() => {
    const el = document.getElementById('pt-ap-radius');
    el.value = '10';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const radiusAfter = await picker.evaluate((el) => getComputedStyle(el).borderRadius);
  expect(radiusAfter).toBe('10px');
  const ctxRadius = await page.locator('#pt-ctx').evaluate((el) => getComputedStyle(el).borderRadius);
  expect(ctxRadius).toBe('10px');
});

test('the saturation square keeps a concentric corner with its own .pt-cp-sv-sat layer', async ({ page }) => {
  const picker = await openPicker(page, '#pt-col-ground');
  const svRadius = await picker.locator('.pt-cp-sv').evaluate((el) => getComputedStyle(el).borderRadius);
  const satRadius = await picker.locator('.pt-cp-sv-sat').evaluate((el) => getComputedStyle(el).borderRadius);
  expect(satRadius).toBe(svRadius);
});
