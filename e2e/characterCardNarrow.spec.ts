/**
 * The Characters card header at 1024 and 1440 (#1943). jsdom has no layout, so
 * whether the name survives beside the ACTIVE marker and the controls can only
 * be measured in a real browser.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_ID } from './support/fixtureData';

const LONG_NAME = 'Test Pilot Longname';

async function landOnCharacters(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await page.waitForURL(/\/overview$/);
  await page.evaluate(
    async ({ characterId, name }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('characters', 'readwrite');
        const store = tx.objectStore('characters');
        const get = store.get(characterId);
        get.onsuccess = () => store.put({ ...get.result, name });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    { characterId: CHARACTER_ID, name: LONG_NAME }
  );
  await page.goto('./characters');
  await expect(page.getByRole('button', { name: `Select ${LONG_NAME}` })).toBeVisible();
}

async function assignToGroup(page: Page) {
  await page.getByRole('button', { name: 'New group' }).click();
  await page.getByRole('textbox', { name: 'New group name' }).fill('Alts');
  await page.keyboard.press('Enter');
  await page.getByRole('combobox', { name: `Group for ${LONG_NAME}` }).click();
  await page.getByRole('option', { name: 'Alts' }).click();
}

async function measure(page: Page) {
  const card = page.getByRole('listitem').filter({ hasText: LONG_NAME }).first();
  const name = card.getByText(LONG_NAME, { exact: true });
  const star = card.getByRole('button', { name: /^(Star|Unstar) /i });
  const remove = card.getByRole('button', { name: `Remove ${LONG_NAME}` });
  await expect(name).toBeVisible();
  const [cardBox, nameBox, starBox, removeBox, overflow] = await Promise.all([
    card.boundingBox(),
    name.boundingBox(),
    star.boundingBox(),
    remove.boundingBox(),
    name.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })),
  ]);
  return {
    cardBox: cardBox!,
    nameBox: nameBox!,
    starBox: starBox!,
    removeBox: removeBox!,
    overflow,
  };
}

for (const grouped of [false, true]) {
  test(`the card name stays readable and the controls stay inside at 1024 (${grouped ? 'grouped' : 'ungrouped'}) (#1943)`, async ({
    page,
  }) => {
    await landOnCharacters(page, { width: 1024, height: 768 });
    if (grouped) await assignToGroup(page);
    const m = await measure(page);
    expect(m.overflow.scrollWidth).toBeLessThanOrEqual(m.overflow.clientWidth);
    expect(m.nameBox.width).toBeGreaterThanOrEqual(100);
    for (const box of [m.starBox, m.removeBox]) {
      expect(box.x).toBeGreaterThanOrEqual(m.cardBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(m.cardBox.x + m.cardBox.width);
    }
  });
}

test('the controls share the identity row at 1440 (#1943)', async ({ page }) => {
  await landOnCharacters(page, { width: 1440, height: 900 });
  const m = await measure(page);
  expect(Math.abs(m.starBox.y - m.nameBox.y)).toBeLessThan(m.nameBox.height + 20);
});
