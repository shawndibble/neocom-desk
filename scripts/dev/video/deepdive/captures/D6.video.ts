/**
 * D6 · Intel. Pilot Lookup: a pasted Local (groups, threat, new arrivals), a pilot's info window
 * (Character, Employment, Interactions), and two pasted D-Scans (danger read, fleet board, share
 * link, then new and gone a minute later). One test, several takes recorded back to back on the
 * same page. The invented pilots, zKillboard answers, hull prices and the share-link stub live in
 * mocks/D6-pilots.ts; the shared world is untouched.
 *
 *   VIDEO_OUT=/mnt/project-files/deep-dive-video/captures/D6 npx playwright test \
 *     -c scripts/dev/video/video.config.ts D6.video
 */
import { test, type Page } from '@playwright/test';
import { hideSandboxNoise, placePointer } from '../../recorder';
import { DEFAULT_OVERVIEW, openWorld } from '../world';
import { pasteText, runTake } from '../mocks/D4-kit';
import { DSCAN_1, DSCAN_2, installD6Mocks, installShareStub, LOCAL_1, LOCAL_2 } from '../mocks/D6-pilots';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D6';
const QUICK = process.env.D4_QUICK === '1';
const SETTLE = 2_000;

test.afterEach(async ({ page }, info) => {
  if (info.status !== 'passed') await page.screenshot({ path: `${OUT}/fail.png` }).catch(() => undefined);
});

/** Waits out the lookup's transient lines, then 2 s more. */
async function settled(page: Page) {
  for (const text of [/Loading zKillboard/i, /Looking up/i, /Loading…/i, /^Checking$/i])
    await page.getByText(text).first().waitFor({ state: 'detached', timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(QUICK ? 300 : SETTLE);
}

test('D6 intel', async ({ page }) => {
  test.setTimeout(0);
  await hideSandboxNoise(page);
  await openWorld(page, './overview', {
    warm: false,
    overview: DEFAULT_OVERVIEW.filter((w) => w.kind !== 'netWorth'),
    before: async (p) => {
      await installD6Mocks(p);
      await installShareStub(p);
    },
  });
  await page.getByText('Arden Kessil').first().waitFor();
  await page.waitForTimeout(6_000);
  await placePointer(page, 1000, 520);
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

  // a) Local: paste anywhere, groups, threat, a second paste for the new arrivals
  await runTake(page, `${OUT}/D6-a`, async (t) => {
    t.mark('overview', 'Overview before the paste');
    await t.hold(3_000);
    t.mark('paste-local', 'A 25-name Local list pasted on the Overview');
    await pasteText(page, LOCAL_1.join('\n'));
    await page.getByText('Corvane Ashdell').first().waitFor({ timeout: 60_000 });
    await settled(page);
    t.mark('list-lands', 'Pilot Lookup opens by itself: 25 pilots grouped by kills in the last 30 days');
    await t.hold(4_500);
    t.mark('threat', 'Threat tag on the most dangerous pilot (Active, with kills by space and ships flown)');
    await t.hover(page.getByText(/^active$/i).first());
    await t.hold(4_500);
    t.mark('group-org-click', 'Click Group by Organization');
    await t.click(page.getByRole('button', { name: /^organization$/i }));
    await settled(page);
    t.mark('group-org', 'Same pilots grouped by alliance, then corporation');
    await t.hold(5_000);
    await t.scroll(400);
    t.mark('group-org-scrolled', 'Scrolled: the other alliances and their corporations');
    await t.hold(4_500);
    await t.scroll(-400);
    await t.hold(1_000);
    t.mark('group-kills-click', 'Click Group by Kills again');
    await t.click(page.getByRole('button', { name: /^kills$/i }).first());
    await settled(page);
    await t.hold(3_000);
  });
  await shot('after-a');

  await runTake(page, `${OUT}/D6-a2`, async (t) => {
    t.mark('paste-local-2', 'A second, changed Local pasted: three pilots left, four arrived');
    await t.hold(1_500);
    await pasteText(page, LOCAL_2.join('\n'));
    await page.getByText(/new since last paste/i).first().waitFor({ timeout: 60_000 });
    await settled(page);
    t.mark('new-arrivals', '"4 new since last paste" and a New tag on each arrival (26 names now)');
    await t.hover(page.getByText(/new since last paste/i).first());
    await t.hold(5_000);
    t.mark('new-arrival-row', 'The new arrival who is also dangerous (Vorlag Reinhardt, Active, New)');
    await t.hover(page.getByText('Vorlag Reinhardt').first());
    await t.hold(5_000);
  });
  await shot('after-a2');

  // b) the info window
  await runTake(page, `${OUT}/D6-b`, async (t) => {
    t.mark('pilot-click', 'Click a pilot to open the info window');
    await t.click(page.getByText('Corvane Ashdell').first());
    await page.locator('dialog[open]').getByText(/Kills per month/i).first().waitFor({ timeout: 60_000 });
    await settled(page);
    t.mark('character-tab', 'Character tab: Threat reading (Active, 53 kills in 90 days), danger, fleet size, kills per month');
    await t.hold(5_000);
    await t.scroll(450);
    t.mark('character-kills', 'Scrolled: flies on kills, kills most, all-time totals and recent kills');
    await t.hold(5_000);
    await t.scroll(-450);
    await t.hold(1_000);
    t.mark('employment-click', 'Click Employment');
    await t.click(page.getByRole('tab', { name: /^employment$/i }));
    await page.getByText(/Current tenure/i).first().waitFor();
    await settled(page);
    t.mark('employment', 'Employment tab: three player corporations in five years, current tenure');
    await t.hold(5_000);
    t.mark('interactions-click', 'Click Interactions (opens on Corporation, nothing there yet)');
    await t.click(page.getByRole('tab', { name: /^interactions$/i }));
    await page.getByText(/Nothing between you|and Corporation/i).first().waitFor({ timeout: 60_000 });
    await t.hold(1_000);
    t.mark('interactions-picker', 'Open the picker: This character / All characters / Corporation');
    await t.click(page.locator('dialog[open] button:has(img)').last());
    await t.hold(1_500);
    t.mark('interactions-pick', 'Pick This character');
    await t.click(page.getByText(/^This character$/).first());
    await page.getByText(/ISK received|ISK sent|Contract/i).first().waitFor({ timeout: 60_000 });
    await settled(page);
    t.mark('interactions', 'Interactions tab: the ISK Arden and this pilot have traded, newest first');
    await t.hold(5_000);
    t.mark('window-close', 'Close the window');
    await t.click(page.locator('dialog[open]').getByRole('button').nth(1));
    await page.waitForTimeout(SETTLE);
    await t.hold(2_000);
  });
  await shot('after-b');

  // c) D-Scan
  await runTake(page, `${OUT}/D6-c`, async (t) => {
    t.mark('paste-dscan', 'A D-Scan of a small gang pasted; Pilot Lookup switches to the scan');
    await pasteText(page, DSCAN_1);
    await page.getByText(/Watch these/i).first().waitFor({ timeout: 60_000 });
    await settled(page);
    t.mark('danger-read', 'Danger read: "5 ships can hurt you, one can pin you down, and 2 can find you."');
    await t.hold(5_000);
    t.mark('watch-these', 'Watch these, most dangerous first');
    await t.hover(page.getByText(/Watch these, most dangerous first/i).first());
    await t.hold(5_000);
    t.mark('leave-if', 'Leave or re-check if');
    await t.hover(page.getByText(/Leave or re-check if/i).first());
    await t.hold(5_000);
    t.mark('fleet-board-open', 'Open Full scan');
    await t.click(page.getByText(/Full scan/i).first());
    await page.waitForTimeout(SETTLE);
    await t.scroll(550);
    t.mark('fleet-board', 'Fleet by role: Support, DPS, Drones, with distances; worth of the hulls; "No earlier scan stored"');
    await t.hold(6_000);
    await t.scroll(-550);
    await t.hold(1_000);
    t.mark('share-click', 'Click Copy Share Link');
    await t.click(page.getByRole('button', { name: /Copy Share Link/i }));
    await page.getByText(/Share Link — works for 7 days/i).first().waitFor();
    await page.waitForTimeout(SETTLE);
    t.mark('share-link', 'The Share Link, good for 7 days, in its field next to Copy');
    await t.hold(5_000);
  });
  await shot('after-c');

  // A real minute passes in the game before the second scan.
  await page.waitForTimeout(QUICK ? 2_000 : 62_000);

  await runTake(page, `${OUT}/D6-d`, async (t) => {
    t.mark('paste-dscan-2', 'A second D-Scan, a minute later');
    await t.hold(1_500);
    await pasteText(page, DSCAN_2);
    await page.getByText(/is new since your last scan|new since your last scan/i).first().waitFor({ timeout: 60_000 });
    await settled(page);
    t.mark('dscan-changed', 'The read drops to Watch; Rapier is new since the last scan; New tags on the list');
    await t.hold(5_000);
    // The section stays open from the first scan; open it only if the new paste closed it.
    const full = page.getByRole('button', { name: /full scan/i }).first();
    if ((await full.getAttribute('aria-expanded').catch(() => null)) === 'false') {
      t.mark('fleet-board-2', 'Open Full scan');
      await t.click(full);
      await page.waitForTimeout(SETTLE);
    }
    await t.scroll(1100);
    t.mark('new-and-gone', 'Since your last scan: who arrived (Basilisk, Rapier, Arazu) and who left (one Loki, -1)');
    await t.hold(6_000);
  });
  await shot('after-d');
});
