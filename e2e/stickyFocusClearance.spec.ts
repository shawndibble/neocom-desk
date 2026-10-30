/**
 * Sticky headers must not cover the keyboard-focused control (issue #3383,
 * WCAG 2.4.11 Focus Not Obscured). Asserted on rendered bounding boxes: tab
 * backwards through a long list and check each focused control sits below
 * the sticky bar, not that some class is present.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

interface SkillRow {
  typeID: number;
  groupName: string;
}

const ALL_SKILLS = JSON.parse(
  readFileSync(new URL('../public/data/skills.json', import.meta.url), 'utf8')
) as SkillRow[];

/** Every `step`th skill, so the picks span many groups. */
function pickSkills(count: number): number[] {
  const step = Math.max(1, Math.floor(ALL_SKILLS.length / count));
  return ALL_SKILLS.filter((_, i) => i % step === 0)
    .slice(0, count)
    .map((s) => s.typeID);
}

async function putRecord(page: Page, store: string, record: Record<string, unknown>) {
  await page.evaluate(
    async ({ store: storeName, record: value }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction([storeName], 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { store, record }
  );
}

/** Focused element's top and its tag/label, after a frame so any focus scroll has settled. */
async function focusedBox(page: Page, insideSelector: string) {
  return page.evaluate(async (selector) => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = document.activeElement as HTMLElement | null;
    if (!el || !el.closest(selector)) return null;
    const rect = el.getBoundingClientRect();
    // The sticky bar: the nearest sticky ancestor of the first search box.
    const search = [...document.querySelectorAll('input')].find((i) =>
      /search/i.test(i.placeholder)
    );
    const barRect = search!.closest('div[class*="sticky"]')!.getBoundingClientRect();
    return {
      top: rect.top,
      barBottom: barRect.bottom,
      label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '',
    };
  }, insideSelector);
}

/**
 * The first assertion after a `goto` waits out the route's cold load (seen failing the
 * Plan editor test at the default 5s on a CI shard, when this ran on the dev server).
 * Same allowance as segmentedSelectedCue.spec.ts.
 */
const COLD_LOAD = { timeout: 15_000 };

test('Skills > Trained: Shift+Tab through rows never lands under the sticky search bar', async ({
  page,
}) => {
  const picks = pickSkills(64);
  await signInAndGoto(page);
  await page.route('**/characters/*/skills', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        skills: picks.map((id) => ({
          skill_id: id,
          trained_skill_level: 3,
          active_skill_level: 3,
          skillpoints_in_skill: 8000,
        })),
        total_sp: picks.length * 8000,
        unallocated_sp: 0,
      }),
    });
  });
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('./skills/trained');

  const search = page.getByPlaceholder(/search/i).first();
  await expect(search).toBeVisible(COLD_LOAD);
  await page.getByRole('button', { name: 'Expand all' }).click();

  const rowButtons = page.locator('main section button');
  const count = await rowButtons.count();
  expect(count).toBeGreaterThan(40);
  await rowButtons.last().focus();

  // The board lists every skill in the SDE, hundreds of rows, so walk a long
  // stretch of them rather than all.
  let checked = 0;
  for (let i = 0; i < Math.min(count + 5, 80); i += 1) {
    const focused = await focusedBox(page, 'main section');
    if (!focused) break; // left the list (reached the sticky bar's controls)
    expect(focused.top, `"${focused.label}" is under the sticky bar`).toBeGreaterThanOrEqual(
      focused.barBottom - 0.5
    );
    checked += 1;
    await page.keyboard.press('Shift+Tab');
  }
  expect(checked).toBeGreaterThan(40);
});

test('Plan editor: Shift+Tab / Tab through the entry list never lands under the sticky header', async ({
  page,
}) => {
  const entries = pickSkills(36).map((skillTypeID) => ({ skillTypeID, targetLevel: 1 }));
  await signInAndGoto(page);
  await putRecord(page, 'skillPlans', {
    id: 'e2e-sticky-plan',
    characterId: CHARACTER_ID,
    name: 'Sticky focus plan',
    entries,
    remapCount: 0,
    updatedAt: Date.now(),
  });
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('./skills/plans/e2e-sticky-plan');

  await expect(page.getByPlaceholder('Search skills…')).toBeVisible(COLD_LOAD);
  const header = page.locator('[class*="lg:sticky"]').first();
  await expect(header).toBeVisible();

  const moreButtons = page.getByRole('button', { name: /^More actions for / });
  await expect(moreButtons.first()).toBeVisible();
  await moreButtons.last().focus();

  let checked = 0;
  const visit = async (key: string, steps: number) => {
    for (let i = 0; i < steps; i += 1) {
      await page.keyboard.press(key);
      const info = await page.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = document.activeElement as HTMLElement | null;
        const h = document.querySelector('[class*="lg:sticky"]');
        if (!el || el === document.body || !h) return null;
        const rect = el.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: h.getBoundingClientRect().bottom,
          inHeader: h.contains(el),
          label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '',
        };
      });
      if (!info || info.inHeader) continue;
      expect(info.top, `"${info.label}" is under the sticky header`).toBeGreaterThanOrEqual(
        info.bottom - 0.5
      );
      checked += 1;
    }
  };

  // Backwards through the entry list and up into the toolbar (Columns, Group by, Add skill)...
  await visit('Shift+Tab', 90);
  // ...and forwards again.
  await visit('Tab', 40);
  expect(checked).toBeGreaterThan(50);
});
