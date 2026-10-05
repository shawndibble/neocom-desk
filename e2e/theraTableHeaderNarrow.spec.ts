/**
 * Travel › Thera / Turnur at 1024px: every column header stays on one line
 * (issue #2605), so the header row is one height and the table still fits its
 * panel with nowrap on.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const LAPTOP = { width: 1024, height: 768 };
const HOUR = 3_600_000;
const THERA = 31000005;

const EXITS = [
  [30002768, 'Uedama', 'The Spire Frontier'],
  [30000144, 'Perimeter', 'Great Wildlands'],
  [30002187, 'Amarr', 'Domain'],
  [30002659, 'Dodixie', 'Outer Passage Reach'],
  [30002510, 'Rens', 'Heimatar'],
  [30002053, 'Hek', 'Heimatar Marches'],
] as const;

const HOLES = EXITS.map(([systemId, name, region], i) => ({
  id: `hole-${i}`,
  signature_type: 'wormhole',
  out_system_id: THERA,
  out_system_name: 'Thera',
  out_signature: `AAA-10${i}`,
  in_signature: `BBB-20${i}`,
  in_system_id: systemId,
  in_system_name: name,
  in_system_class: 'hs',
  in_region_name: region,
  wh_type: 'Q063',
  max_ship_size: 'medium',
  expires_at: new Date(Date.now() + (i + 3) * HOUR).toISOString(),
}));

test('Thera table headers share one line and the table fits its panel at 1024px (issue #2605)', async ({
  page,
}) => {
  await page.route('https://api.eve-scout.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(HOLES),
    })
  );
  await page.setViewportSize(LAPTOP);
  await signInAndGoto(page, './travel/thera');

  const table = page.getByRole('table', { name: 'Open holes out of Thera and Turnur' });
  await expect(table.getByRole('row')).toHaveCount(HOLES.length + 1);

  const headers = table.getByRole('columnheader');
  const heights = new Set<number>();
  for (const header of await headers.all()) {
    const box = await header.boundingBox();
    if (box && box.width > 1) heights.add(Math.round(box.height));
  }
  expect(heights.size).toBe(1);

  // The squeeze that wraps "Life left" needs live route data to reproduce, so
  // also pin the cause: no header (or its sort button) is allowed to wrap.
  const wraps = await headers.evaluateAll((cells) =>
    cells
      .filter((cell) => cell.textContent?.trim())
      .map((cell) => getComputedStyle(cell.querySelector('button') ?? cell).whiteSpace)
      .filter((whiteSpace) => whiteSpace !== 'nowrap')
  );
  expect(wraps).toEqual([]);

  const fit = await table.evaluate((el) => {
    const panel = el.parentElement!.getBoundingClientRect();
    return {
      tableRight: el.getBoundingClientRect().right,
      panelRight: panel.right,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(fit.tableRight).toBeLessThanOrEqual(fit.panelRight + 0.5);
  expect(fit.pageOverflow).toBeLessThanOrEqual(0);
});
