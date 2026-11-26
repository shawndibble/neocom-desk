/**
 * D4 · Fit. One long test, several takes (D4-a ... D4-g) recorded back to back on the same page,
 * so each take starts where the last one ended. Arden's skills are lowered by this file's own
 * mock (mocks/D4-skills.ts); the shared world is untouched.
 *
 *   VIDEO_OUT=/mnt/project-files/deep-dive-video/captures/D4 npx playwright test \
 *     -c scripts/dev/video/video.config.ts D4
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hideSandboxNoise, placePointer } from '../../recorder';
import { DEFAULT_OVERVIEW, openWorld } from '../world';
import { D4_LOWERED, installLoweredSkills } from '../mocks/D4-skills';
import { pasteText, runTake } from '../mocks/D4-kit';
import { D4_SETTINGS, installLpStores } from '../mocks/D4-lp';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D4';
const STOP = process.env.D4_STOP ?? 'z';
/** D4_FROM=e starts at take e on a within-budget copy of the fit (working out steps, never for the real recording). */
const FROM = process.env.D4_FROM ?? 'a';
const FIT = readFileSync(new URL('../mocks/D4-drake.eft', import.meta.url), 'utf8');
const done = (take: string) => take >= STOP;

test.afterEach(async ({ page }, info) => {
  if (info.status !== 'passed') await page.screenshot({ path: `${OUT}/fail.png` }).catch(() => undefined);
});

test('D4 fit', async ({ page }) => {
  test.setTimeout(0);
  await hideSandboxNoise(page);
  await openWorld(page, './overview', {
    warm: false,
    overview: DEFAULT_OVERVIEW.filter((w) => w.kind !== 'netWorth'),
    settings: D4_SETTINGS,
    before: async (p) => {
      await installLoweredSkills(p, D4_LOWERED);
      await installLpStores(p);
    },
  });
  await page.getByText('Arden Kessil').first().waitFor();
  await page.waitForTimeout(6_000);
  await placePointer(page, 1000, 520);
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  if (FROM > 'd') {
    await pasteText(page, readFileSync('/tmp/claude-0/drake-fits.eft', 'utf8'));
    await page.getByText('Calibration', { exact: false }).first().waitFor();
    await settled(page);
  }
  // a) paste on the Overview; the router opens Fittings
  if (FROM <= 'd') {
  await runTake(page, `${OUT}/D4-a`, async (t) => {
    t.mark('overview', 'Overview before the paste (Arden, nothing about fittings)');
    await t.hold(3_000);
    t.mark('paste-fit', 'EFT text pasted on the Overview');
    await pasteText(page, FIT);
    await page.getByText('Over by').first().waitFor({ timeout: 30_000 });
    await settled(page);
    t.mark('fit-lands', 'Fittings opens by itself with the Halcyon Drake Brawl loaded on Arden');
    await t.hold(4_000);
    t.mark('stats-offense', 'Offense stats for the pasted fit');
    await t.hover(page.getByText('DPS', { exact: false }).first());
    await t.hold(4_000);
    t.mark('cpu-over', 'CPU 629 / 600, over by 29');
    await t.hover(page.getByText('Over by').first());
    await t.hold(4_500);
  });
  await shot('after-a');
  if (done('b')) return;
  // b) Makes it fit: the skills, then the shortfall and the ways out; Make flyable
  await runTake(page, `${OUT}/D4-b`, async (t) => {
    t.mark('pilot-open', 'Open the Pilot drawer from the fit header');
    await t.click(page.getByRole('button', { name: /^pilot/i }).first());
    await page.getByText('Makes it fit', { exact: false }).first().waitFor();
    await settled(page);
    t.mark('makes-it-fit', 'Makes it fit: the skills Arden is missing, and the CPU skills that bring the fit under budget');
    await t.hold(5_000);
    await t.click(page.getByRole('button', { name: /close/i }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('fix-cpu-click', 'Click Fix CPU under the over-budget CPU bar');
    await t.click(page.getByText('Fix CPU', { exact: true }).first());
    await page.getByText(/Checking implants/i).waitFor({ state: 'detached', timeout: 60_000 });
    await settled(page);
    t.mark('shortfall', 'Make it fit dialog: CPU is 29 tf over budget; ways out start below');
    await t.hold(4_500);
    t.mark('way-train', 'Train: the skills that free CPU, with time');
    await t.hover(page.getByText('Weapon Upgrades V', { exact: false }).first());
    await t.hold(4_000);
    t.mark('way-implant', 'Implants: what each frees and costs');
    await t.hover(page.getByText("Zainou 'Gypsy' CPU Management EE-606").first());
    await t.hold(4_500);
    t.mark('way-swap', 'Swap modules: cheaper modules, what each frees');
    await t.hover(page.getByText('SWAP MODULES', { exact: false }).first());
    await t.scroll(300);
    await t.hold(4_500);
    t.mark('swap-pick', 'Pick the recommended swap');
    await t.click(page.getByText('Caldari Navy Multispectrum Shield Hardener').first());
    await page.waitForTimeout(SETTLE);
    t.mark('swap-applied', 'Swap applied: CPU 598 / 600, the fit now fits');
    await t.hold(4_500);
  });
  await shot('after-b');
  if (done('c')) return;
  // c) Improves fit: Rank by, a level, Add to plan, the Undo toast, Open Skill Plan
  await runTake(page, `${OUT}/D4-c`, async (t) => {
    t.mark('pilot-open', 'Open the Pilot drawer');
    await t.click(page.getByRole('button', { name: /^pilot/i }).first());
    await page.getByText('Improves fit', { exact: false }).first().waitFor();
    await settled(page);
    t.mark('improves-fit', 'Improves fit: skills ranked by what they do for this exact fit');
    await t.hold(5_000);
    t.mark('rank-by-open', 'Rank by menu');
    await t.click(page.getByRole('combobox', { name: /rank by/i }));
    await t.hold(3_500);
    await t.click(page.getByRole('option', { name: 'DPS' }));
    await settled(page);
    t.mark('ranked-by-dps', 'List re-ranked by DPS');
    await t.hold(4_500);
    t.mark('pick-level', 'Pick the level to train from the split button');
    await t.click(page.getByRole('button', { name: /Level to train: Missile Bombardment/i }));
    await t.hold(3_500);
    await t.click(page.getByRole('menuitemradio', { name: /^V/ }).or(page.getByRole('menuitem', { name: /^V/ })).first());
    await page.waitForTimeout(SETTLE);
    t.mark('level-picked', 'Level V picked: gain and time follow it');
    await t.hold(4_000);
    t.mark('add-to-plan', 'Add to plan');
    await t.click(page.getByRole('button', { name: /Add to plan: Missile Bombardment/i }));
    await page.getByText('Undo', { exact: true }).waitFor();
    await page.waitForTimeout(SETTLE);
    t.mark('undo-toast', 'Toast: added to the plan named after the fit, with Undo');
    await t.hover(page.getByText('Undo', { exact: true }));
    await t.hold(4_500);
    t.mark('open-plan', 'Open Skill Plan');
    await t.click(page.getByRole('link', { name: 'Open Skill Plan' }));
    await page.waitForURL(/skills\/plans/);
    await settled(page);
    t.mark('plan-open', 'The plan named after the fit, with its finish date');
    await t.hold(5_000);
  });
  await shot('after-c');
  if (done('c2')) return;
  // b2) Make flyable (recorded after the skills take; the editor places it after 'Makes it fit')
  await page.goBack();
  await page.getByRole('button', { name: /^(fix fit|improve)/i }).first().waitFor();
  await settled(page);
  await runTake(page, `${OUT}/D4-b2`, async (t) => {
    t.mark('improve-open', 'Open Improve (header button reads Fix fit while a budget is over)');
    await t.click(page.getByRole('button', { name: /^(improve|fix fit)/i }).first());
    await page.getByText(/Checked \d+ swaps/i).waitFor({ timeout: 90_000 });
    await settled(page);
    t.mark('make-flyable', 'Make Flyable: a module Arden cannot fly yet, swapped for one he can');
    await t.hover(page.getByText('MAKE FLYABLE', { exact: false }).first());
    await t.hold(5_000);
    t.mark('flyable-tick', 'Tick the Make Flyable swap');
    await t.click(page.getByRole('checkbox').first());
    await t.hold(3_000);
    t.mark('flyable-apply', 'Apply it');
    await t.click(page.getByRole('button', { name: /^apply/i }).first());
    await page.getByText(/Checked \d+ swaps/i).waitFor({ timeout: 90_000 });
    await settled(page);
    t.mark('flyable-applied', 'Applied: the fit is flyable today (Pilot chip no longer says missing)');
    await t.hold(4_500);
  });
  await shot('after-b2');
  // d) Improve with a goal and a budget: ranked changes, the before-and-after preview, apply; then Makeover
  await runTake(page, `${OUT}/D4-d`, async (t) => {
    t.mark('goal-pick', 'Improve is open; pick the goal More damage');
    await t.hold(3_000);
    await t.click(page.getByRole('button', { name: /more damage/i }));
    await page.getByText(/Checked \d+ swaps/i).waitFor({ timeout: 90_000 });
    await settled(page);
    t.mark('goal-more-damage', 'Goal More damage: ranked changes');
    await t.hold(4_000);
    t.mark('settings-open', 'Open Search settings');
    await t.click(page.getByText('Search settings', { exact: false }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('budget-type', 'Type a budget of 150 million in Total budget (ISK)');
    const budget = page.getByLabel(/Total budget/i);
    await t.click(budget);
    await t.type('150000000');
    await page.keyboard.press('Tab');
    await page.getByText(/Checked \d+ swaps/i).waitFor({ timeout: 90_000 });
    await settled(page);
    t.mark('budget-set', 'Budget 150 million: the changes now stay under it');
    await t.hold(4_500);
    t.mark('settings-close', 'Collapse Search settings');
    await t.click(page.getByText('Search settings', { exact: false }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('ranked-changes', 'The ranked list of changes with applied DPS gain, cost and savings');
    await t.hold(4_500);
    await page.getByText('Find implants', { exact: false }).first().waitFor();
    await page.waitForTimeout(SETTLE);
    const firstChange = page.getByRole('checkbox').first();
    const rowBox = (await firstChange.boundingBox())!;
    t.mark('hover-preview', 'Hover one change: every stat before and after, shown on the stats column');
    await t.hoverPoint(rowBox.x + 150, rowBox.y + 20);
    await t.hold(5_000);
    t.mark('tick-change', 'Tick the change');
    await t.click(firstChange);
    await t.hold(3_000);
    t.mark('apply-change', 'Apply');
    await t.click(page.getByRole('button', { name: /^apply/i }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('change-applied', 'Applied: the fit has the new modules (Applied toast with Undo)');
    await t.hold(4_500);
    t.mark('rework-open', 'Search settings: Reach set to Rework to look for a Makeover');
    await t.click(page.getByText('Search settings', { exact: false }).first());
    await page.waitForTimeout(SETTLE);
    await t.click(page.getByRole('button', { name: /^rework$/i }));
    await page.getByText(/Whole Makeover/i).first().waitFor({ timeout: 120_000 });
    await settled(page);
    t.mark('makeover', 'Makeover: several changes found together, figures for the whole fit');
    await t.hold(5_000);
    t.mark('makeover-preview', 'The stats column previews the whole Makeover');
    await t.hover(page.getByText(/Whole Makeover/i).first());
    await t.hold(5_000);
  });
  await shot('after-d');
  if (done('d2')) return;
  }
  expect(true).toBe(true);

  // e) Implants & boosters window, Find by goal (the Implant Finder)
  await runTake(page, `${OUT}/D4-e`, async (t) => {
    if (await page.getByText(/^improve fit$/i).first().isVisible().catch(() => false)) {
      t.mark('improve-close', 'Close the Improve panel');
      await t.click(page.getByRole('button', { name: /close/i }).first());
      await page.waitForTimeout(SETTLE);
    }
    t.mark('pilot-open', 'Open the Pilot drawer');
    await t.click(page.getByRole('button', { name: /^pilot/i }).first());
    await settled(page);
    await t.hold(2_500);
    t.mark('implants-open', 'Open Implants & boosters from the Pilot drawer (Implants: My clone)');
    await t.click(page.getByRole('button', { name: /Implants:/i }));
    await page.locator('dialog[open]').getByText('Find by goal', { exact: false }).first().waitFor();
    await page.getByText(/Trying implants/i).first().waitFor({ state: 'detached', timeout: 90_000 }).catch(() => undefined);
    await settled(page);
    t.mark('find-by-goal', 'Implants & boosters window on the Find by goal tab: goals to pick from');
    await t.hold(4_500);
    const dialog = page.locator('dialog[open]');
    t.mark('goal-pick', 'Pick the goal Applied DPS');
    await t.click(dialog.getByText('Applied DPS', { exact: true }).first());
    await dialog.getByText(/Implants that help/i).waitFor({ timeout: 120_000 });
    await settled(page);
    t.mark('goal-results', 'Every implant tried on this fit: DPS gain, market price at the hub and LP store offer');
    await t.hold(5_000);
    t.mark('lp-store-price', 'An implant sold in a Trade Hub and an LP Store: both prices side by side');
    await t.hover(dialog.getByText(/LP Store/).first());
    await t.hold(5_000);
    t.mark('implant-add', 'Add one');
    await t.click(dialog.getByRole('button', { name: /^add/i }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('implant-added', 'The implant fills a slot in Your set; the fit now uses it');
    await t.hold(5_000);
    if (await dialog.isVisible().catch(() => false)) {
      t.mark('implants-close', 'Close the window; stats use the new implant');
      await t.click(dialog.getByRole('button', { name: /close/i }).first());
      await page.waitForTimeout(SETTLE);
    }
    await t.hold(4_000);
  });
  await shot('after-e');
  if (done('f')) return;

  // f) five fitting tricks, one take each (D4-f1 ... D4-f5). Trick 3 is recorded first: it needs the
  // two launcher groups on different ammo, which trick 1 (a high-slot drop loads every launcher) would level.
  const slot = (label: RegExp) => page.getByRole('button', { name: label }).first();
  await runTake(page, `${OUT}/D4-f3`, async (t) => {
    await t.click(page.getByRole('button', { name: /close/i }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('trick-3-load-all', 'Trick 3: right-click a launcher; the three Caldari Navy launchers hold different ammo');
    await t.hold(3_000);
    const launcher = (await slot(/High slots \d+: (?:True Sansha Heavy Missile Launcher|Heavy Missile Launcher I),/).boundingBox())!;
    await t.hoverPoint(launcher.x + launcher.width / 2, launcher.y + launcher.height / 2);
    await page.waitForTimeout(AIM);
    await page.mouse.click(launcher.x + launcher.width / 2, launcher.y + launcher.height / 2, { button: 'right' });
    await page.getByText(/into all compatible/i).first().waitFor();
    t.mark('trick-3-menu', 'Menu: Load Scourge Heavy Missile into all compatible');
    await t.hold(4_000);
    await t.click(page.getByText(/into all compatible/i).first());
    await page.waitForTimeout(SETTLE);
    t.mark('trick-3-done', 'Every launcher now holds the same charge; one offense line');
    await t.hold(4_500);
  });
  await runTake(page, `${OUT}/D4-f1`, async (t) => {
    t.mark('trick-1-drag-charge', 'Trick 1: drag a charge from the Charges tab onto a weapon slot');
    await t.click(page.getByRole('tab', { name: /^charges/i }).or(page.getByText('CHARGES', { exact: true })).first());
    await page.waitForTimeout(SETTLE);
    const charge = page.locator('[draggable=true]').filter({ hasText: /Dread Guristas/ }).first();
    const from = (await charge.boundingBox())!;
    const to = (await slot(/High slots \d+: (?:True Sansha Heavy Missile Launcher|Heavy Missile Launcher I),/).boundingBox())!;
    await t.drag(
      { x: from.x + 60, y: from.y + from.height / 2 },
      { x: to.x + to.width / 2, y: to.y + to.height / 2 }
    );
    await page.waitForTimeout(SETTLE);
    t.mark('trick-1-done', 'Dread Guristas Scourge now loaded in every launcher; offense total moves');
    await t.hold(4_500);
  });
  await runTake(page, `${OUT}/D4-f2`, async (t) => {
    t.mark('trick-2-cycle-state', 'Trick 2: click a module tile to cycle its state');
    await t.click(slot(/Mid slots 1:/));
    await t.hold(3_500);
    t.mark('trick-2-second', 'Second click: next state');
    await t.click(slot(/Mid slots 1:/));
    await t.hold(3_500);
    t.mark('trick-2-third', 'Third click: back round');
    await t.click(slot(/Mid slots 1:/));
    await t.hold(3_500);
  });
  await runTake(page, `${OUT}/D4-f4`, async (t) => {
    t.mark('trick-4-open', 'Trick 4: open the Pilot drawer, Skills selector');
    await t.click(page.getByRole('button', { name: /^pilot/i }).first());
    await settled(page);
    await t.hold(2_500);
    await t.click(page.getByRole('combobox', { name: /^skills/i }));
    await t.hold(3_000);
    t.mark('trick-4-pick', 'Pick All V (what if my skills were all V)');
    await t.click(page.getByRole('option', { name: 'All V' }));
    await page.getByText(/all skills V/i).first().waitFor();
    await settled(page);
    t.mark('trick-4-done', 'Heading reads Arden Kessil, all skills V; every stat recalculated');
    await t.hold(5_000);
  });
  // back to Arden's own skills, outside the recording
  await page.getByRole('combobox', { name: /^skills/i }).click();
  await page.getByRole('option', { name: 'Own skills' }).click();
  await settled(page);
  await runTake(page, `${OUT}/D4-f5`, async (t) => {
    await t.click(page.getByRole('button', { name: /close/i }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('trick-5-export', 'Trick 5: open Export');
    await t.click(page.getByRole('button', { name: /^export/i }));
    await t.hold(3_500);
    t.mark('trick-5-pick', 'Copy multibuy list, minus owned');
    await t.click(page.getByRole('menuitem', { name: /minus owned/i }));
    await page.getByText(/Multibuy list copied/i).first().waitFor();
    await page.waitForTimeout(SETTLE);
    t.mark('trick-5-done', 'Toast: multibuy list copied, minus what Arden holds in the station');
    await t.hold(5_000);
  });
  await shot('after-f');
  if (done('g')) return;

  // g) Export > Appraise in Market, then Compare hubs
  await runTake(page, `${OUT}/D4-g`, async (t) => {
    t.mark('appraise-export', 'Open Export');
    await t.click(page.getByRole('button', { name: /^export/i }));
    await t.hold(3_000);
    t.mark('appraise-pick', 'Appraise in Market');
    await t.click(page.getByRole('menuitem', { name: /appraise in market/i }));
    await page.waitForURL(/appraisal/i);
    await page.getByRole('button', { name: /compare hubs/i }).first().waitFor({ timeout: 60_000 });
    await settled(page);
    t.mark('appraisal', 'The appraisal of the whole fit: hull and every module priced at the trade hub');
    await t.hold(5_000);
    t.mark('compare-hubs-click', 'Click Compare hubs');
    await t.click(page.getByRole('button', { name: /compare hubs/i }).first());
    await settled(page);
    t.mark('compare-hubs', "Each hub's price for the fit with jumps from Arden's current system (Nourvukaiken)");
    await t.hold(6_000);
    // Jumps from Arden's system live in the Compare drawer's Trade hubs view.
    for (const i of [0, 1]) {
      await page.getByText(/^add to compare$/i).first().waitFor({ state: 'detached' }).catch(() => undefined);
      await page.waitForTimeout(2_500);
      const row = page.locator('tbody tr').nth(i).getByRole('link').first();
      await row.scrollIntoViewIfNeeded();
      const box = (await row.boundingBox())!;
      await t.hoverPoint(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(AIM);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      await page.getByText(/^add to compare$/i).first().waitFor();
      if (i === 0) t.mark('compare-menu', 'Right-click an item: Add to Compare');
      await t.hold(2_000);
      await t.click(page.getByText(/^add to compare$/i).first());
      await page.waitForTimeout(SETTLE);
    }
    t.mark('compare-drawer', 'The Compare drawer holds the two items');
    await t.hold(3_500);
    t.mark('compare-open', 'Open the Compare drawer');
    await t.click(page.getByRole('button', { name: /^compare \(\d+\)/i }).first());
    await settled(page);
    await t.hold(3_500);
    t.mark('trade-hubs-click', 'Pick Trade hubs');
    await t.click(page.getByText(/^trade hubs$/i).first());
    await settled(page);
    t.mark('trade-hubs', "Each hub's prices with jumps from Nourvukaiken");
    await t.hold(6_000);
  });
  await shot('after-g');
});
const SETTLE = 2_000;

/** Waits out the editor's transient loading lines, then 2 s more. */
async function settled(page: Page) {
  for (const text of [/Checking what fits/i, /Loading graphs/i, /Checking skills/i, /Working out each skill/i])
    await page.getByText(text).first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(SETTLE);
}
const AIM = 400;
