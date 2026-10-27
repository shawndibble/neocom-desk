/**
 * The selected segment of a SegmentedControl carries a non-colour cue (issue
 * #3361, WCAG 1.4.1): an inset accent underline. Asserted on computed style
 * and rendered size, so the underline must not resize or wrap a segment.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

/**
 * The first assertion after `goto`: on a cold dev server the Travel route's
 * module graph can take longer than Playwright's default 5s to serve, leaving
 * `main` on its loading placeholders (seen failing the first test of a CI
 * shard, and on a fresh local server). Same allowance as bpcSourcingNarrow.
 */
const COLD_LOAD = { timeout: 15_000 };

for (const width of [1280, 320]) {
  test(`travel segments: selected has an accent underline, same size (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await signInAndGoto(page, './travel');
    // On a phone the rules panel sits behind a toggle.
    if (width < 640) await page.getByRole('button', { name: 'Show route rules' }).click();
    const segs = page.locator('div[role="group"] > button[aria-pressed]');
    await expect(segs.first()).toBeVisible(COLD_LOAD);
    const rows = await segs.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          pressed: e.getAttribute('aria-pressed'),
          shadow: getComputedStyle(e).boxShadow,
          h: Math.round(r.height),
          lines: e.getClientRects().length,
        };
      })
    );
    expect(rows.some((r) => r.pressed === 'true')).toBe(true);
    for (const r of rows) {
      if (r.pressed === 'true') expect(r.shadow).not.toBe('none');
      else expect(r.shadow).toBe('none');
      expect(r.lines).toBe(1);
    }
  });
}
