/**
 * Jump clone names in the Clones list (issues #2087, #3002): the name shows
 * beside the place, a blank one reads "Unnamed", and a long one wraps inside
 * its card instead of widening the list past its Panel, down to a phone.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const STATION = 60003760;
const PLACE = 'Jita 4 - Moon 4 - Caldari Navy Assembly Plant';
const LONG_NAME = 'X'.repeat(60);

function clone(id: number, name?: string) {
  return {
    jump_clone_id: id,
    location_id: STATION,
    location_type: 'station',
    implants: [],
    ...(name === undefined ? {} : { name }),
  };
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`clone names show beside the location and long names stay in the panel without overflow at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    // The shared mock answers /clones with no clones; seed this spec's own.
    await page.route(`**/characters/${CHARACTER_ID}/clones`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jump_clones: [clone(1, 'Alpha'), clone(2, 'Beta'), clone(3, '   '), clone(4, LONG_NAME)],
        }),
      })
    );
    await signInAndGoto(page, './clones');

    const list = page.getByRole('list', { name: 'Clones' });
    const row = (name: string) => list.getByRole('listitem').filter({ hasText: name });
    await expect(row('Alpha')).toContainText(PLACE);
    await expect(row('Beta')).toContainText(PLACE);
    await expect(row('Unnamed').first()).toContainText(PLACE);
    await expect(row('Alpha')).not.toContainText('#');

    const long = list.getByText(LONG_NAME);
    await expect(long).toBeVisible();
    const listBox = await list.boundingBox();
    const panelBox = await list.locator('xpath=ancestor::section[1]').boundingBox();
    const longBox = await long.boundingBox();
    expect(longBox!.x + longBox!.width).toBeLessThanOrEqual(listBox!.x + listBox!.width + 1);
    expect(listBox!.x + listBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

/**
 * Layout invariants for the Clones summary strip and Settings > Data age
 * (no overlap between the strip's columns, no sideways page scroll).
 */
for (const size of [
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`the clones summary strip does not overlap and the page does not scroll sideways at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await signInAndGoto(page, './clones');
    const strip = page.getByRole('region', { name: 'You are in' });
    await expect(strip).toBeVisible();
    const boxes = [];
    for (const name of ['Jump Cooldown', 'You are in']) {
      boxes.push(await page.getByRole('region', { name }).boundingBox());
    }
    const [a, b] = boxes as { x: number; y: number; width: number; height: number }[];
    const apart =
      a.x + a.width <= b.x + 1 ||
      b.x + b.width <= a.x + 1 ||
      a.y + a.height <= b.y + 1 ||
      b.y + b.height <= a.y + 1;
    expect(apart).toBe(true);
    // The cooldown header is said once (the old chip label repeated it).
    await expect(page.getByText('Jump Cooldown', { exact: true })).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('Settings > Data age stays inside a 390px page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndGoto(page, './clones');
  await expect(page.getByRole('region', { name: 'You are in' })).toBeVisible();
  // Client-side navigation: the Data age list is session-only, built from this
  // visit's fetches, so a reload would empty it.
  await page.evaluate(() => {
    const base = location.pathname.replace(/\/clones\/?$/, '');
    history.pushState({}, '', `${base}/settings/dataAge`);
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: /^Data age$/i })).toBeVisible();
  // Folded by default: the log's rows are absent, only the header shows.
  await expect(page.getByRole('table', { name: /data age/i })).toHaveCount(0);
  const caret = page.getByRole('button', { name: /show data age/i });
  await expect(caret).toBeVisible();
  const box = await caret.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(36);
  expect(box!.height).toBeGreaterThanOrEqual(36);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
