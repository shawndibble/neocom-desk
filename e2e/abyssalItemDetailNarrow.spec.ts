/**
 * Item Detail's roll tables at phone width: the owned module's rolls and an
 * abyssal type's roll ranges stay tables (`responsive="table"`) and scroll
 * sideways in their own wrapper (DESIGN.md §4a). Without one, the table
 * widened the dialog body, which then scrolled as a whole and pushed Roll
 * quality off the phone's edge.
 *
 * Containment only, no pixel figures. MutaMarket isn't reachable in E2E
 * (Firebase is blanked), so the estimate line shows its unavailable state.
 */
import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

/** 5MN Abyssal Microwarpdrive, made from a 5MN Microwarpdrive II by an Unstable mutaplasmid. */
const ABYSSAL_TYPE = 47740;
const ITEM_ID = 1_000_000_001;

async function mockRolls(page: Page) {
  await page.route(`https://esi.evetech.net/dogma/dynamic/items/${ABYSSAL_TYPE}/*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        created_by: 1,
        mutator_type_id: 47738,
        source_type_id: 440,
        dogma_attributes: [
          { attribute_id: 6, value: 30 },
          { attribute_id: 20, value: 540 },
          { attribute_id: 30, value: 14.2 },
          { attribute_id: 50, value: 29.5 },
          { attribute_id: 554, value: 410 },
        ],
        dogma_effects: [],
      }),
    })
  );
}

/** The dialog's scrolling body never scrolls sideways; the named table's own wrapper does. */
async function expectTableScrollsAlone(page: Page, tableName: string) {
  const table = page.getByRole('table', { name: tableName });
  await expect(table).toBeVisible({ timeout: 15_000 });
  const widths = await table.evaluate((el) => {
    const wrapper = el.parentElement!;
    let body: HTMLElement | null = wrapper.parentElement;
    while (body && getComputedStyle(body).overflowY !== 'auto') body = body.parentElement;
    return {
      bodyScroll: body!.scrollWidth,
      bodyClient: body!.clientWidth,
      wrapperOverflowX: getComputedStyle(wrapper).overflowX,
      wrapperScroll: wrapper.scrollWidth,
      wrapperClient: wrapper.clientWidth,
    };
  });
  expect(widths.bodyScroll).toBeLessThanOrEqual(widths.bodyClient);
  expect(widths.wrapperOverflowX).toBe('auto');
  // The table really is wider than a phone, so the wrapper is what scrolls.
  expect(widths.wrapperScroll).toBeGreaterThan(widths.wrapperClient);
}

test.describe('Abyssal Item Detail at 390px', () => {
  test.use({ viewport: PHONE });

  test("an owned module's rolls table scrolls inside its own wrapper", async ({ page }) => {
    await mockRolls(page);
    await signInAndGoto(page, `./overview?info=type-${ABYSSAL_TYPE}-${ITEM_ID}`);
    await expectTableScrollsAlone(page, "This module's rolls");
  });

  test("an abyssal type's roll ranges table scrolls inside its own wrapper", async ({ page }) => {
    await signInAndGoto(page, `./overview?info=type-${ABYSSAL_TYPE}`);
    await expectTableScrollsAlone(page, 'Roll ranges on a 5MN Microwarpdrive II, by mutaplasmid');
  });
});
