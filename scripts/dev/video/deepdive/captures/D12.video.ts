/**
 * D12 · V2 beats 2-4, one take: paste the fit on the Overview, Fittings with the fit on Arden,
 * What to train > Makes it fit, Make flyable (tick, Apply, Applied), What to train > Improves fit,
 * add to the plan, Open Skill Plan. Arden is docked in Yona (D10's world) with D4's lowered skills.
 * The CPU swap is NOT pre-applied. Stat text before/after is logged to OUT/stats.json.
 *
 *   VIDEO_OUT=/mnt/project-files/deep-dive-video/captures/D12 npx playwright test \
 *     -c scripts/dev/video/video.config.ts D12
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { hideSandboxNoise, placePointer } from '../../recorder';
import { DEFAULT_OVERVIEW, openWorld } from '../world';
import { D4_LOWERED, installLoweredSkills } from '../mocks/D4-skills';
import { pasteText, runTake } from '../mocks/D4-kit';
import { D4_SETTINGS, installLpStores } from '../mocks/D4-lp';
import { installD10Danger, installHekBook, installSeyllinChokepoint, YONA, YONA_STATION } from '../mocks/D10-route';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D12';
const SETTLE = 2_000;
const FIT = readFileSync(new URL('../mocks/D4-drake.eft', import.meta.url), 'utf8');

async function settled(page: Page) {
  for (const text of [/Checking what fits/i, /Loading graphs/i, /Checking skills/i, /Working out each skill/i])
    await page.getByText(text).first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(SETTLE);
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== 'passed') await page.screenshot({ path: `${OUT}/fail.png` }).catch(() => undefined);
});

test('D12 fit beats', async ({ page }) => {
  test.setTimeout(0);
  mkdirSync(OUT, { recursive: true });
  const waypointCalls: string[] = [];
  await hideSandboxNoise(page);
  await openWorld(page, './overview', {
    warm: false,
    systemId: YONA,
    stationId: YONA_STATION,
    overview: DEFAULT_OVERVIEW.filter((w) => w.kind !== 'netWorth'),
    settings: [...D4_SETTINGS, { key: 'sync.routePreference', value: 'shortest' }],
    before: async (p) => {
      await installLoweredSkills(p, D4_LOWERED);
      await installLpStores(p);
      await installD10Danger(p, waypointCalls);
      await installSeyllinChokepoint(p);
      await installHekBook(p);
    },
  });
  await page.getByText('Arden Kessil').first().waitFor();
  await page.waitForTimeout(6_000);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

  // Pre-warm (not recorded): paste, open the Pilot panel and Improve once so every graph and skill ranking
  // is cached in memory, then return to the Overview through the app's own history (no reload).
  await pasteText(page, FIT);
  await page.getByText('Over by').first().waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByRole('button', { name: /^pilot/i }).first().click();
  await page.getByText('Improves fit', { exact: false }).first().waitFor({ timeout: 60_000 });
  await settled(page);
  await page.getByRole('button', { name: /close/i }).first().click();
  await page.waitForTimeout(SETTLE);
  await page.getByText('Fix CPU', { exact: true }).first().click();
  await page.getByText(/Checking implants/i).waitFor({ state: 'detached', timeout: 60_000 }).catch(() => undefined);
  await settled(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE);
  await page.goBack();
  await page.getByText('Arden Kessil').first().waitFor();
  await page.waitForTimeout(SETTLE);
  await placePointer(page, 1000, 520);

  const statsText = () =>
    page.evaluate(() => (document.querySelector('main') as HTMLElement | null)?.innerText ?? document.body.innerText);
  const stats: Record<string, string> = {};

  await runTake(page, OUT, async (t) => {
    t.mark('overview-rest', 'Overview, cursor at rest, before the paste');
    await t.hold(3_000);
    t.mark('paste-fit', 'I copy the fit and paste it: EFT text pasted on the Overview');
    await pasteText(page, FIT);
    await page.getByText('Over by').first().waitFor({ timeout: 30_000 });
    await settled(page);
    t.mark('fit-lands', 'It opens in the fitting tool, loaded on my pilot (Fittings, Halcyon Drake Brawl on Arden)');
    await t.hold(3_000);
    stats.before = await statsText();
    t.mark('stats-offense', 'Every number uses my real skills: damage');
    await t.hover(page.getByText('DPS', { exact: false }).first());
    await t.hold(3_500);
    t.mark('stats-tank', 'tank');
    await t.hover(page.getByText('EHP', { exact: false }).first());
    await t.hold(3_500);
    t.mark('stats-cap', 'capacitor');
    await t.hover(page.getByText('Capacitor', { exact: false }).first());
    await t.hold(3_500);
    t.mark('stats-speed', 'and speed');
    await t.hover(page.getByText('Max velocity', { exact: false }).or(page.getByText('Speed', { exact: false })).first());
    await t.hold(3_500);

    t.mark('pilot-open', 'And right away, the bad news: open the Pilot / What to train panel');
    await t.click(page.getByRole('button', { name: /^pilot/i }).first());
    await page.getByText('Makes it fit', { exact: false }).first().waitFor();
    await settled(page);
    t.mark('makes-it-fit', 'Make it fit lists exactly what is missing (new grouped UI)');
    await shot('m-makes-it-fit');
    await t.hover(page.getByText('Makes it fit', { exact: false }).first());
    await t.hold(4_000);
    await t.click(page.getByRole('button', { name: /close/i }).first());
    await page.waitForTimeout(SETTLE);

    // Make flyable only exists once the fit is inside its budget (Improve says "Fix it first" otherwise).
    t.mark('fix-cpu-click', 'EXTRA (not in narration): Fix CPU, the fit is over budget and Improve is locked until it is not');
    await t.click(page.getByText('Fix CPU', { exact: true }).first());
    await page.getByText(/Checking implants/i).waitFor({ state: 'detached', timeout: 60_000 }).catch(() => undefined);
    await settled(page);
    t.mark('fix-cpu-dialog', 'EXTRA: Make it fit dialog, CPU 29 tf over');
    await t.hold(3_000);
    t.mark('swap-pick', 'EXTRA: take the recommended module swap so the fit is inside CPU');
    await t.click(page.getByText('Caldari Navy Multispectrum Shield Hardener').first());
    await page.waitForTimeout(SETTLE);
    await t.hold(3_000);
    t.mark('improve-open', 'If I want to undock tonight: open Improve');
    await t.click(page.getByRole('button', { name: /^(fix fit|improve)/i }).first());
    await page.getByText(/Checked \d+ swaps/i).waitFor({ timeout: 90_000 });
    await settled(page);
    t.mark('make-flyable', 'Make flyable swaps that module for the closest one I can use today');
    await t.hover(page.getByText('MAKE FLYABLE', { exact: false }).first());
    await t.hold(5_000);
    t.mark('flyable-tick', 'Tick the swap');
    await t.click(page.getByRole('checkbox').first());
    await t.hold(3_000);
    t.mark('flyable-apply', 'Apply');
    await t.click(page.getByRole('button', { name: /^apply/i }).first());
    await page.getByText(/Checked \d+ swaps/i).waitFor({ timeout: 90_000 });
    await settled(page);
    stats.after = await statsText();
    t.mark('flyable-applied', 'Applied, and I can see what changes. A small loss');
    await shot('m-applied');
    await t.hold(5_000);
    await t.click(page.getByRole('button', { name: /close/i }).first());
    await page.waitForTimeout(SETTLE);

    t.mark('pilot-open-2', 'Now the long game: back to What to train');
    await t.click(page.getByRole('button', { name: /^pilot/i }).first());
    await page.getByRole('combobox', { name: /rank by/i }).waitFor();
    await settled(page);
    t.mark('improves-fit', 'Improves fit ranks every skill by how much it helps this exact ship');
    await shot('m-improves-fit');
    await t.hold(4_500);
    t.mark('pick-level', 'I pick the level');
    await t.click(page.getByRole('button', { name: /Level to train:/i }).first());
    await t.hold(3_000);
    await t.click(page.getByRole('menuitemradio', { name: /^V/ }).or(page.getByRole('menuitem', { name: /^V/ })).first());
    await page.waitForTimeout(SETTLE);
    t.mark('level-picked', 'Level picked: gain and time follow it');
    await t.hold(3_500);
    t.mark('add-to-plan', 'add it to a plan named after the fit');
    await t.click(page.getByRole('button', { name: /Add to plan:/i }).first());
    await page.getByText('Undo', { exact: true }).waitFor();
    await page.waitForTimeout(SETTLE);
    t.mark('undo-toast', 'Toast: added to the plan named after the fit');
    await shot('m-toast');
    await t.hover(page.getByText('Undo', { exact: true }));
    await t.hold(4_000);
    t.mark('open-plan', 'Open Skill Plan');
    await t.click(page.getByRole('link', { name: 'Open Skill Plan' }));
    await page.waitForURL(/skills\/plans/);
    await settled(page);
    t.mark('plan-open', 'the plan named after the fit, and the date I will be ready');
    await shot('m-plan');
    await t.hold(5_000);
  });
  writeFileSync(`${OUT}/stats.json`, JSON.stringify(stats, null, 2));
  expect(true).toBe(true);
});
