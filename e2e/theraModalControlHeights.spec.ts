/**
 * The Thera / Turnur modal's filter row (Hub, Exit, Fits) keeps its controls at
 * one height at desktop and phone width (DESIGN.md §3: one size per row).
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CONTROL_ROW_WIDTHS, expectInlineControlsAligned } from './support/controlHeights';
import { openTheraModal } from './support/theraModal';

const HOUR = 3_600_000;
const JITA = 30000142;

for (const width of CONTROL_ROW_WIDTHS) {
  test(`the Thera / Turnur modal keeps its filter row at one control height at ${width}px`, async ({
    page,
  }) => {
    await page.route('https://api.eve-scout.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify([
          {
            id: '9001',
            signature_type: 'wormhole',
            out_system_id: 31000005,
            out_system_name: 'Thera',
            out_signature: 'ABC-123',
            in_system_id: JITA,
            in_system_name: 'Jita',
            in_system_class: 'hs',
            in_region_name: 'The Forge',
            in_signature: 'XYZ-789',
            wh_type: 'Q063',
            max_ship_size: 'large',
            expires_at: new Date(Date.now() + 24 * HOUR).toISOString(),
          },
        ]),
      })
    );
    {
      const phone = width < 640;
      await page.setViewportSize({ width, height: 844 });
      await signInAndGoto(page, `./travel/route?from=${JITA}`);
      const dialog = await openTheraModal(page, { phone });
      await expect(
        dialog.getByRole('table', { name: 'Open holes out of Thera and Turnur' })
      ).toBeVisible();
      await expectInlineControlsAligned(page, `Thera / Turnur modal at ${width}px`, 'dialog[open]');
    }
  });
}
