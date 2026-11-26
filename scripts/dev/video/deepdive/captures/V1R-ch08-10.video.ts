/**
 * V1 reshoot, chapters 08 (Arrive), 09 (Build), 10 (Wallet): one continuous take each, written to
 * ${VIDEO_OUT}/ch08 .. ch10 (default /mnt/project-files/deep-dive-video/captures/V1R).
 *
 *   VIDEO_CHROMIUM=/opt/pw-browsers/chromium VITE_EVE_CLIENT_ID=sandbox npx playwright test \
 *     -c scripts/dev/video/video.config.ts V1R-ch08-10 [-g ch08]
 */
import { test, type Page } from '@playwright/test';
import { clickHere, hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { DEFAULT_OVERVIEW, openWorld } from '../world';
import { installD7 } from '../mocks/D7-world';
import { Marks, makeRig } from '../mocks/D7-rec';
import { pasteText } from '../mocks/D4-kit';
import { DSCAN_1, installD6Mocks, installShareStub, LOCAL_1, LOCAL_2 } from '../mocks/D6-pilots';
import { installV1RCh08, UNKNOWN } from '../mocks/V1R-ch08';

const OUT = process.env.VIDEO_OUT ?? '/mnt/project-files/deep-dive-video/captures/V1R';

/** Rig with the reshoot typing pace (90 ms a character). */
function rig(page: Page, marks: Marks) {
  const r = makeRig(page, marks);
  return { ...r, type: (text: string) => page.keyboard.type(text, { delay: 90 }) };
}

async function settled(page: Page) {
  for (const text of [/Loading zKillboard/i, /Looking up/i, /Loading…/i, /^Checking$/i])
    await page.getByText(text).first().waitFor({ state: 'detached', timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(2_000);
}

test('ch08 arrive', async ({ page }) => {
  test.setTimeout(900_000);
  await hideSandboxNoise(page);
  await openWorld(page, './overview', {
    warm: false,
    overview: DEFAULT_OVERVIEW.filter((w) => w.kind !== 'netWorth'),
    before: async (p) => {
      await installD6Mocks(p);
      await installShareStub(p);
      await installV1RCh08(p);
    },
  });
  await page.getByText('Arden Kessil').first().waitFor();
  await page.waitForTimeout(6_000);

  // Warm every lookup the take will make (pilot data, zKillboard, names) without showing it.
  await pasteText(page, LOCAL_2.join('\n'));
  await page.getByText('Vorlag Reinhardt').first().waitFor({ timeout: 90_000 });
  await settled(page);
  await page.getByText('Vorlag Reinhardt').first().click();
  await page.locator('dialog[open]').getByText(/Kills per month/i).first().waitFor({ timeout: 60_000 });
  await settled(page);
  await page.getByRole('tab', { name: /^employment$/i }).click();
  await page.getByText(/Current tenure/i).first().waitFor();
  await page.getByRole('tab', { name: /^interactions$/i }).click();
  await page.getByText(/ISK received|ISK sent|Contract/i).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1_500);
  await page.keyboard.press('Escape');
  await pasteText(page, DSCAN_1);
  await page.getByText(/Watch these/i).first().waitFor({ timeout: 60_000 });
  await settled(page);
  // Back to a clean Overview for the take.
  // Forget the warm-up pastes so the take's first Local has no "new" tags and the scan is fresh.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('settings', 'readwrite');
      tx.objectStore('settings').delete('local.lastPaste');
      tx.objectStore('settings').delete('dscan.lastScan');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
  await page.goto('./overview');
  await page.getByText('Arden Kessil').first().waitFor();
  await page.waitForTimeout(6_000);
  await placePointer(page, 1000, 520);

  const marks = new Marks();
  const { glide, press, hold, scroll } = rig(page, marks);
  const rec = await startRecording(page, `${OUT}/ch08`);
  await page.waitForTimeout(500);

  marks.mark('overview', 'Overview before the paste');
  await glide(page.getByText('Arden Kessil').first(), 1000);
  await hold(2500);
  marks.mark('paste-local', 'A 25-name Local pasted (Ctrl+V) on the Overview');
  await page.waitForTimeout(1200);
  await pasteText(page, LOCAL_1.join('\n'));
  await page.getByText('Corvane Ashdell').first().waitFor({ timeout: 60_000 });
  await settled(page);
  marks.mark('list-lands', 'Pilot Lookup opens by itself: 25 pilots grouped by kills');
  await hold(4000);
  marks.mark('group-org-click', 'Click Group by Organization');
  await press(page.getByRole('button', { name: /^organization$/i }), 1000);
  await settled(page);
  marks.mark('group-org', 'Same pilots grouped by alliance, then corporation');
  await hold(4500);
  marks.mark('active-tag', 'Active tag on the dangerous pilot');
  await glide(page.getByText(/^active$/i).first(), 1000);
  await hold(4000);
  marks.mark('paste-local-2', 'A changed Local pasted: arrivals get a New tag');
  await page.waitForTimeout(800);
  await pasteText(page, LOCAL_2.join('\n'));
  await page.getByText(/new since last paste/i).first().waitFor({ timeout: 60_000 });
  await settled(page);
  marks.mark('new-tags', '"4 new since last paste" and New tags on the arrivals');
  await glide(page.getByText(/new since last paste/i).first(), 1000);
  await hold(4500);

  const unknown = page.getByText(UNKNOWN.name).first();
  // Smooth-scroll the unknown pilot into the middle of the screen.
  for (let i = 0; i < 40; i++) {
    const box = await unknown.boundingBox();
    if (box && box.y > 300 && box.y < 620) break;
    await page.mouse.wheel(0, box && box.y < 300 ? -30 : 30);
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(800);
  marks.mark('pilot-click', 'Click the unknown pilot (Active, New)');
  await press(unknown, 1000);
  await page.locator('dialog[open]').getByText(/Kills per month/i).first().waitFor({ timeout: 60_000 });
  await settled(page);
  marks.mark('character-tab', 'Character tab: threat reading, danger, kills per month');
  await hold(4500);
  await scroll(450);
  marks.mark('character-kills', 'Scrolled: recent kills with system names');
  await hold(4500);
  await scroll(-450);
  await hold(800);
  marks.mark('employment-click', 'Click Employment');
  await press(page.getByRole('tab', { name: /^employment$/i }), 1000);
  await page.getByText(/Current tenure/i).first().waitFor();
  await settled(page);
  marks.mark('employment', 'Employment: corporations over time, current tenure');
  await hold(4500);
  marks.mark('interactions-click', 'Click Interactions');
  await press(page.getByRole('tab', { name: /^interactions$/i }), 1000);
  await page.getByText(/ISK received|ISK sent|Contract/i).first().waitFor({ timeout: 60_000 });
  await settled(page);
  marks.mark('interactions', 'Interactions: ISK traded with this pilot, newest first (This character)');
  await hold(4500);
  marks.mark('window-close', 'Close the window');
  await press(page.locator('dialog[open]').getByRole('button').nth(1), 1000);
  await page.waitForTimeout(2000);
  await hold(1500);

  marks.mark('paste-dscan', 'A D-Scan pasted; Pilot Lookup switches to the scan');
  await pasteText(page, DSCAN_1);
  await page.getByText(/Watch these/i).first().waitFor({ timeout: 60_000 });
  await settled(page);
  marks.mark('danger-read', 'Danger read headline');
  await hold(4500);
  marks.mark('watch-these', 'Watch these, most dangerous first');
  await glide(page.getByText(/Watch these, most dangerous first/i).first(), 1000);
  await hold(4500);
  marks.mark('leave-if', 'Leave or re-check if');
  await glide(page.getByText(/Leave or re-check if/i).first(), 1000);
  await hold(4500);
  const result = await rec.stop();
  marks.write(`${OUT}/ch08`);
  console.log(`ch08: ${result.frames} frames over ${result.seconds.toFixed(1)}s`);
});

test('ch09 build', async ({ page }) => {
  test.setTimeout(900_000);
  await hideSandboxNoise(page);
  await openWorld(page, './industry/opportunities', {
    active: 'mira',
    before: (p) => installD7(p),
    settings: [{ key: 'marketWideVisibleColumns', value: ['margin', 'vs90d', 'orderDepth', 'buildCost'] }],
  });
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Large Shield Extender II' }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(4000);
  await placePointer(page, 1150, 300);

  const marks = new Marks();
  const { glide, press, hold, type, scroll } = rig(page, marks);
  const rec = await startRecording(page, `${OUT}/ch09`);
  await page.waitForTimeout(500);

  marks.mark('opportunities', 'Industry Opportunities, ranked');
  await glide(page.getByText('ISK/DAY', { exact: false }).first(), 1100);
  await hold(4000);
  const row = page.getByRole('row').filter({ hasText: 'Large Shield Extender II' }).first();
  marks.mark('plan-click', 'Plan on Large Shield Extender II');
  await press(row.getByRole('button', { name: 'Plan' }), 1100);
  await page.getByRole('button', { name: 'Edit setup' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  marks.mark('plan-verdict', 'Build Plan verdict: profit, margin, break-even');
  await hold(5000);

  marks.mark('setup-open', 'Edit setup');
  await press(page.getByRole('button', { name: 'Edit setup' }), 1100);
  await hold(2500);
  await press(page.getByText('Override', { exact: true }), 1000);
  await hold(2000);
  await press(page.getByRole('combobox', { name: 'Facility' }), 1000);
  await hold(1500);
  await press(page.getByRole('option', { name: 'Raitaru' }), 900);
  await hold(2000);
  const system = page.getByRole('textbox', { name: /build system/i });
  await press(system, 1000);
  await page.keyboard.press('Control+A');
  await type('Tunttaras');
  await page.keyboard.press('Tab');
  await hold(3000);
  await scroll(260, 26);
  await glide(page.getByText('Total job cost', { exact: false }).first(), 1000).catch(() => undefined);
  marks.mark('cheaper-systems', 'Costs & revenue: cheaper system one jump away');
  await hold(5000);

  await scroll(380, 38);
  const ram = page.getByRole('button', { name: /Build instead/ }).nth(1);
  marks.mark('make-or-buy', 'Make-or-buy markers on component rows');
  await glide(ram, 1100);
  await hold(4500);
  marks.mark('buy-ore-click', 'Buy ore instead');
  await press(page.getByRole('button', { name: 'Buy ore instead' }), 1100);
  await page.getByText('Buy ore instead of minerals').waitFor();
  marks.mark('buy-ore-dialog', 'Buy ore instead of minerals dialog');
  await hold(5000);
  await press(page.getByRole('button', { name: 'Close' }).first(), 1000);
  await hold(1500);

  for (let i = 0; i < 40; i++) {
    const box = await page.getByRole('button', { name: 'Calculations?' }).boundingBox();
    if (box && box.y > 0 && box.y < 900) break;
    await page.mouse.wheel(0, -40);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(600);
  marks.mark('calculations-click', 'Calculations?');
  await press(page.getByRole('button', { name: 'Calculations?' }), 1100);
  await page.getByText('How this Build Plan is calculated', { exact: false }).waitFor();
  marks.mark('calculations-dialog', 'How this Build Plan is calculated');
  await hold(5000);
  await scroll(360, 30);
  await hold(4000);
  const result = await rec.stop();
  marks.write(`${OUT}/ch09`);
  console.log(`ch09: ${result.frames} frames over ${result.seconds.toFixed(1)}s`);
});

test('ch10 wallet', async ({ page }) => {
  test.setTimeout(600_000);
  await hideSandboxNoise(page);
  await openWorld(page, './wallet/journal', { active: 'arden', before: (p) => installD7(p) });
  await page.getByText('Market: ', { exact: false }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await placePointer(page, 1000, 500);

  const marks = new Marks();
  const { glide, glidePoint, press, hold } = rig(page, marks);
  const rec = await startRecording(page, `${OUT}/ch10`);
  await page.waitForTimeout(500);

  marks.mark('journal-one-character', 'Wallet Journal, Arden');
  await glide(page.getByText('entries', { exact: false }).first(), 1100);
  await hold(4000);
  marks.mark('scope-click', 'Character scope control');
  await glidePoint(1297, 34, 1100);
  await page.waitForTimeout(450);
  await clickHere(page);
  await hold(2500);
  marks.mark('scope-menu', 'Menu: This character / All characters');
  await press(page.getByRole('menuitemradio', { name: /All characters/ }).or(page.getByRole('menuitem', { name: /All characters/ })).first(), 1000);
  await page.waitForTimeout(2500);
  await hold(3000);
  marks.mark('all-characters', 'Journal spans all three characters');

  marks.mark('where-click', 'Where the ISK went');
  await press(page.getByRole('button', { name: 'Where the ISK went' }), 1100);
  await page.getByText('Daily flow', { exact: false }).first().waitFor();
  marks.mark('where-by-type', 'Where the ISK went, by type');
  await hold(5000);
  await press(page.getByRole('tab', { name: 'By party' }).or(page.getByRole('button', { name: 'By party' })).first(), 1000);
  marks.mark('where-by-party', 'By party');
  await hold(5000);
  await press(page.getByRole('tab', { name: 'By type' }).or(page.getByRole('button', { name: 'By type' })).first(), 1000);
  await hold(1500);
  marks.mark('between-characters', 'Between your Characters, left out of In and Out');
  await glide(page.getByText(/Between your Characters ·/).first(), 1100);
  await hold(4500);

  const box = (await page.getByText('Daily flow').first().boundingBox())!;
  marks.mark('chart-day-hover', 'Hover a day on the chart');
  await glidePoint(Number(process.env.D8_DAY_X ?? 1384), box.y + 55, 1100);
  await hold(3000);
  marks.mark('chart-day-click', 'Click the day');
  await page.waitForTimeout(450);
  await clickHere(page);
  marks.mark('day-filtered', 'Journal filtered to that day');
  await hold(5000);
  const result = await rec.stop();
  marks.write(`${OUT}/ch10`);
  console.log(`ch10: ${result.frames} frames over ${result.seconds.toFixed(1)}s`);
});
