/**
 * Thera / Turnur hub badge on a phone (issue #2609): beside a long exit-system
 * name the badge shrank with the truncating name and broke mid-word
 * ("THER" over "A"). The badge must stay one line at its natural width while
 * the name ellipsises. jsdom has no layout engine, so only a real browser can
 * confirm it.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };

const THERA_SYSTEM_ID = 31000005;
const TURNUR_SYSTEM_ID = 30002086;
const LONG_NAME = 'Tash-Murkon Prime Long Name That Keeps Going On Forever';

function signature(id: number, outSystemId: number, name: string) {
  return {
    id,
    signature_type: 'wormhole',
    out_system_id: outSystemId,
    out_signature: 'ABC-123',
    in_system_id: 30000142 + id,
    in_signature: 'XYZ-789',
    in_system_name: name,
    in_system_class: 'hs',
    in_region_name: 'Region',
    wh_type: 'K162',
    max_ship_size: 'large',
    expires_at: new Date(Date.now() + 8 * 3_600_000).toISOString(),
  };
}

test('hub badge stays one line beside a long exit name at 390px', async ({ page }) => {
  await page.route('https://api.eve-scout.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([
        signature(1, THERA_SYSTEM_ID, 'Jita'),
        signature(2, THERA_SYSTEM_ID, LONG_NAME),
        signature(3, TURNUR_SYSTEM_ID, LONG_NAME),
      ]),
    });
  });
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './travel/thera');

  const main = page.getByRole('main');
  const badges = main.getByText(/^(thera|turnur)$/i);
  await expect(badges).toHaveCount(3);

  const heights = await badges.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().height))
  );
  expect(new Set(heights).size).toBe(1);

  const name = main.getByText(LONG_NAME).first();
  const truncated = await name.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(truncated).toBe(true);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
