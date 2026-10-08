/**
 * Jump clone names in the Clones table's Location cell (issue #2087): the
 * name shows beside the location, a blank one shows nothing, and a long one
 * wraps inside its cell instead of widening the table past its Panel.
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
]) {
  test(`clone names show beside the location and long names stay in the panel at ${size.width}px`, async ({
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

    const table = page.getByRole('table');
    await expect(table.getByRole('cell', { name: `Alpha · ${PLACE}` })).toBeVisible();
    await expect(table.getByRole('cell', { name: `Beta · ${PLACE}` })).toBeVisible();
    await expect(table.getByRole('cell', { name: `Unnamed · ${PLACE}` })).toBeVisible();
    await expect(table).not.toContainText('#');

    const long = table.getByText(LONG_NAME);
    await expect(long).toBeVisible();
    const tableBox = await table.boundingBox();
    const panelBox = await table.locator('xpath=ancestor::section[1]').boundingBox();
    const longBox = await long.boundingBox();
    expect(longBox!.x + longBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width + 1);
    expect(tableBox!.x + tableBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
  });
}
