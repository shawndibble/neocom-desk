/**
 * Overview board card's "Open" link touch target on a phone (issue #1070):
 * the link had no height class of its own, so its hit box was only its own
 * text/icon height (~16-17px) — well under the touch floor — even though
 * the header around it was already sized to the 44px touch tier. (`Panel`'s
 * `actions` wrapper div only hugs its content's height rather than
 * stretching to the header, so the link couldn't inherit that height for
 * free.) The fix adds `min-h-11 md:min-h-0` directly to the link: a 44px
 * floor below `md`, reset back to the original content-hugging height at
 * and above it, since desktop's box was never meant to grow.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };

test('board card "Open" link meets the 44px touch floor at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './overview');

  // Every board card's link shares this label — one is enough per the AC
  // ("for at least one board card"), so the first rendered card's is fine.
  const openLink = page.getByRole('link', { name: 'Open' }).first();
  await expect(openLink).toBeVisible();

  // Polled: a card remounted as the board's reads land measures as a null box.
  await expect
    .poll(async () => (await openLink.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
});

// Issue #1680: the cards|alerts split keys off the viewport, not the width the
// sidebar leaves, so it starts at `xl` — below that the cards take the full row.
for (const size of [
  { width: 1024, height: 768 },
  { width: 1180, height: 900 },
]) {
  test(`board cards do not truncate and alerts stack below at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await signInAndGoto(page, './overview');
    const opens = page.getByRole('link', { name: 'Open' });
    await expect(opens.first()).toBeVisible();

    const truncated = await page.locator('main').evaluate((main) =>
      [...main.querySelectorAll<HTMLElement>('*')]
        .filter((el) => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1)
        .filter((el) => getComputedStyle(el).textOverflow === 'ellipsis')
        .map((el) => el.textContent)
    );
    expect(truncated).toEqual([]);

    const alerts = await page
      .locator('main')
      .getByText('Alerts', { exact: true })
      .first()
      .boundingBox();
    const firstCard = await opens.first().boundingBox();
    expect(alerts!.y).toBeGreaterThan(firstCard!.y);
  });
}

// The summary strip's three values need nearly all of its row from `sm` up
// (about 600px at 700 with no sidebar, 775px at 1024 with one), so a font a
// hair wider than this machine's (CI's) used to push one under its cell and
// truncate the wallet's ten-figure balance. The row now wraps before any value
// truncates; widening every glyph a little stands in for that other font, so
// this holds on any machine rather than by font luck.
for (const size of [
  { width: 700, height: 900 },
  { width: 1024, height: 768 },
  { width: 1180, height: 900 },
]) {
  test(`summary strip wraps rather than truncating a value, even in a wider font, at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await signInAndGoto(page, './overview');
    // Labels keep their own wide tracking; only the values are widened.
    await page.addStyleTag({
      content: 'main section *:not(.uppercase) { letter-spacing: 0.04em !important; }',
    });
    const strip = page.locator('main section').first();
    // Wallet and training arrive from separate reads — wait for both, or the
    // check below could pass against a strip that is still half empty.
    await expect(strip.getByText(/ISK$/)).toBeVisible();
    const trainingCell = strip.locator('span.flex-col', {
      has: page.getByText('Training now', { exact: true }),
    });
    await expect(
      trainingCell.getByRole('link').or(trainingCell.getByText('Nothing in training'))
    ).toBeVisible();

    const truncated = await strip.evaluate((section) =>
      [...section.querySelectorAll<HTMLElement>('*')]
        .filter((el) => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1)
        .filter((el) => getComputedStyle(el).textOverflow === 'ellipsis')
        .map((el) => el.textContent)
    );
    expect(truncated).toEqual([]);
  });
}

for (const width of [1280, 1440]) {
  test(`alerts column sits right of the cards at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAndGoto(page, './overview');
    const opens = page.getByRole('link', { name: 'Open' });
    await expect(opens.first()).toBeVisible();

    // The first row's second card is the rightmost domain card; later Open
    // links include the Alerts panel's own, which would defeat the comparison.
    const rightCard = await opens.nth(1).boundingBox();
    const cardsRight = rightCard!.x + rightCard!.width;
    const alerts = await page
      .locator('main')
      .getByText('Alerts', { exact: true })
      .first()
      .boundingBox();
    expect(alerts!.x).toBeGreaterThan(cardsRight);
  });
}

// Issue #1684: the strip's fixed empty answers used to be single-line
// truncated to "Nothing on a cl..." at phone width.
test('summary strip empty answers are not clipped at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './overview');

  for (const text of ['Nothing on a clock', 'Nothing in training']) {
    const value = page.locator('main').getByText(text, { exact: true }).first();
    await expect(value).toBeVisible();
    const clipped = await value.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(clipped).toBe(false);
  }
});
