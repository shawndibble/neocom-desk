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
