/**
 * D5: market within 10 jumps, route safety to the cheap-but-dangerous hub, avoid a system,
 * Prefer shorter -> Prefer safer, Set waypoints. Takes D5-a (market), D5-b (route, kills, avoid),
 * D5-c (V2 payoff: Prefer safer, market again, waypoints).
 */
import { test, expect, type Page } from '@playwright/test';
import { clickHere, glideToPoint, hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { DRONE_AMP, installD5Danger, installD5Market, NOURVUKAIKEN, OISIO } from '../mocks/D5-route';
import { hold, Marks, pointAt, pressOn } from '../mocks/D5-kit';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D5';
const MARKET = `./market/browser?type=${DRONE_AMP}&region=all`;

async function open(page: Page, path: string, waypoints: string[] = []) {
  await hideSandboxNoise(page);
  await openWorld(page, path, {
    warm: false,
    settings: [{ key: 'sync.routePreference', value: 'shortest' }],
    before: async (p) => {
      await installD5Danger(p, waypoints);
      await installD5Market(p);
    },
  });
  await page.getByText('Drone Damage Amplifier II').first().waitFor({ timeout: 30_000 }).catch(() => undefined);
}

test.describe.configure({ mode: 'serial' });

test('D5-a market within 10 jumps', async ({ page }) => {
  await open(page, MARKET);
  await page.getByText(/Sell orders/i).first().waitFor();
  await page.waitForTimeout(6000);
  await placePointer(page, 1100, 700);
  const dir = `${OUT}/D5-a`;
  const rec = await startRecording(page, dir);
  const marks = new Marks();
  await page.waitForTimeout(2000);
  marks.mark('market-all', 'Drone Damage Amplifier II, All regions, Distance not set');
  await hold(page, 3);
  marks.anchor();
  const distance = page.getByRole('combobox', { name: 'Distance' }).first();
  marks.mark('distance-start', 'open the Distance select');
  await pressOn(page, distance);
  await page.getByRole('option', { name: 'Within 10 jumps' }).waitFor();
  await hold(page, 1.5);
  await pressOn(page, page.getByRole('option', { name: 'Within 10 jumps' }), 900);
  await page.getByText(/Within 10 jumps of Nourvukaiken/).waitFor();
  await page.waitForTimeout(2000);
  marks.mark('within-10', 'Within 10 jumps of Nourvukaiken; cheapest order is 6 jumps out at Oisio');
  await hold(page, 4.5);
  // highsec only
  await pressOn(page, page.getByRole('button', { name: /filters/i }).last());
  await page.waitForTimeout(1200);
  marks.mark('highsec-start', 'open order filters');
  const secSelect = page.getByRole('button', { name: /Security/ }).first();
  await pressOn(page, secSelect);
  await hold(page, 1);
  await pressOn(page, page.getByRole('menuitemcheckbox', { name: 'Lowsec' }).or(page.getByRole('option', { name: 'Lowsec' })).first(), 900);
  await hold(page, 1);
  await pressOn(page, page.getByRole('menuitemcheckbox', { name: 'Nullsec' }).or(page.getByRole('option', { name: 'Nullsec' })).first(), 900);
  await hold(page, 1);
  await pressOn(page, page.getByRole('menuitemcheckbox', { name: 'Wormhole' }).or(page.getByRole('option', { name: 'Wormhole' })).first(), 900);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  marks.mark('highsec-only', 'Security filter: Highsec only');
  await hold(page, 4);
  // sort by jumps
  const jumpsHead = page.getByRole('region', { name: 'Sell Orders' }).getByRole('columnheader', { name: /Jumps/ });
  await pressOn(page, jumpsHead);
  await page.waitForTimeout(1500);
  marks.mark('sort-jumps', 'order book sorted by jumps: nearest stations first, dearer');
  await hold(page, 5);
  const priceHead = page.getByRole('region', { name: 'Sell Orders' }).getByRole('columnheader', { name: /Price/ });
  await pressOn(page, priceHead);
  await page.waitForTimeout(1500);
  if (!(await page.getByRole('region', { name: 'Sell Orders' }).getByRole('row').nth(1).textContent())?.includes('435,708')) {
    await pressOn(page, priceHead);
    await page.waitForTimeout(1500);
  }
  marks.mark('sort-price', 'sorted by price: Oisio, 6 jumps, cheapest');
  await hold(page, 4);
  const sells = page.getByRole('region', { name: 'Sell Orders' });
  const rowMenu = sells.getByRole('row').filter({ hasText: 'Oisio 5 - Moon 6' }).first().getByRole('button', { name: /More actions/ });
  await pressOn(page, rowMenu);
  await page.waitForTimeout(1200);
  marks.mark('row-menu', 'order row menu: copy price, Set destination');
  await page.screenshot({ path: `${OUT}/d5a-menu.png` });
  await hold(page, 4);
  await pressOn(page, page.getByRole('menuitem', { name: 'Copy price' }), 900);
  await page.waitForTimeout(1200);
  marks.mark('copy-price', 'Copy price: the plain digits go to the clipboard');
  await hold(page, 3.5);
  await pressOn(page, rowMenu);
  await page.waitForTimeout(1000);
  await pressOn(page, page.getByRole('menuitem', { name: 'Set waypoint in game' }), 900);
  await page.waitForTimeout(1500);
  marks.mark('set-destination', 'Set waypoint in game sent for the Oisio station');
  await hold(page, 4.5);
  const out = await rec.stop();
  marks.write(dir);
  console.log(`D5-a ${out.frames} frames ${out.seconds.toFixed(1)}s`);
});

/** The market book of the drone amplifier within 10 jumps, set before recording starts. */
async function prepareRange(page: Page) {
  await page.getByText(/Sell orders/i).first().waitFor();
  await page.waitForTimeout(4000);
  await page.getByRole('combobox', { name: 'Distance' }).first().click();
  await page.getByRole('option', { name: 'Within 10 jumps' }).click();
  await page.getByText(/Within 10 jumps of Nourvukaiken/).waitFor();
  await page.waitForTimeout(3000);
  await placePointer(page, 1100, 700);
}

const oisioJumpLink = (page: Page) =>
  page
    .getByRole('region', { name: 'Sell Orders' })
    .getByRole('row')
    .filter({ hasText: 'Oisio 5 - Moon 6' })
    .first()
    .getByRole('link', { name: /open route safety/ });

test('D5-b route safety, kills, avoid', async ({ page }) => {
  await open(page, MARKET);
  await prepareRange(page);
  const dir = `${OUT}/D5-b`;
  const rec = await startRecording(page, dir);
  const marks = new Marks();
  await page.waitForTimeout(2000);
  await hold(page, 2);
  marks.mark('market-6', 'Market within 10 jumps: cheapest order is 6 jumps away at Oisio');
  await hold(page, 3);
  marks.anchor();
  await pressOn(page, oisioJumpLink(page));
  await page.getByText('Gank Chokepoint').first().waitFor();
  await page.waitForTimeout(3500);
  marks.mark('route-shorter', 'Route Safety Nourvukaiken to Oisio on Shorter: 6 jumps, lowest 0.3, chokepoint Tama');
  await hold(page, 4.5);
  await pointAt(page, page.getByText('Gank Chokepoint').first());
  marks.mark('chokepoint', 'Tama row carries the Gank Chokepoint marker, 6 ship / 3 pod kills in the last hour');
  await hold(page, 4.5);
  const killsButton = page.getByRole('button', { name: /6 player kills/ }).first();
  await pressOn(page, killsButton);
  await page.waitForTimeout(2500);
  marks.mark('killmails', 'kill count opened: the killmails in Tama in the last hour');
  await hold(page, 5);
  await page.screenshot({ path: `${OUT}/d5b-kills.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const tamaRow = page.getByRole('row').filter({ hasText: 'Gank Chokepoint' }).first();
  await pressOn(page, tamaRow.getByRole('button', { name: /actions|more/i }).last());
  await page.waitForTimeout(1200);
  marks.mark('row-menu', 'Tama row menu with Avoid');
  await page.screenshot({ path: `${OUT}/d5b-rowmenu.png` });
  await hold(page, 3.5);
  await pressOn(page, page.getByRole('menuitem', { name: /Avoid/ }).first(), 900);
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(2000);
  marks.mark('avoid-preview', 'Avoid Tama? preview: the route becomes 8 jumps (+2)');
  await page.screenshot({ path: `${OUT}/d5b-avoid.png` });
  await hold(page, 5);
  await pressOn(page, page.getByRole('dialog').getByRole('button', { name: /^Avoid Tama/ }), 900);
  await page.waitForTimeout(2500);
  marks.mark('avoided', 'Tama is on Avoided Systems; the route now reads 8 jumps');
  await hold(page, 4.5);
  await page.goBack();
  await page.getByText(/Within 10 jumps of Nourvukaiken/).waitFor();
  await page.waitForTimeout(3000);
  marks.mark('market-8', 'Back on the market: the Oisio orders now read 8 jumps');
  await hold(page, 5);
  await page.screenshot({ path: `${OUT}/d5b-market8.png` });
  const out = await rec.stop();
  marks.write(dir);
  console.log(`D5-b ${out.frames} frames ${out.seconds.toFixed(1)}s`);
});

test('D5-c prefer safer, market again, waypoints', async ({ page }) => {
  const waypoints: string[] = [];
  await open(page, MARKET, waypoints);
  await prepareRange(page);
  const dir = `${OUT}/D5-c`;
  const rec = await startRecording(page, dir);
  const marks = new Marks();
  await page.waitForTimeout(2000);
  marks.mark('market-6', 'Market within 10 jumps on Prefer shorter: Oisio 6 jumps');
  await hold(page, 3.5);
  marks.anchor();
  await pressOn(page, oisioJumpLink(page));
  await page.getByText('Gank Chokepoint').first().waitFor();
  await page.waitForTimeout(3500);
  marks.mark('route-shorter', 'Route Safety on Shorter: 6 jumps, lowsec, Gank Chokepoint Tama');
  await hold(page, 5);
  const saferCard = page.getByRole('button', { name: /^Safer/ }).first();
  await pressOn(page, saferCard);
  await page.waitForTimeout(3000);
  marks.mark('route-safer', 'Prefer safer: the route redraws, 8 jumps, lowest 0.5, no chokepoint');
  await hold(page, 5);
  await page.screenshot({ path: `${OUT}/d5c-safer.png` });
  await page.goBack();
  await page.getByText(/Within 10 jumps of Nourvukaiken/).waitFor();
  await page.waitForTimeout(3000);
  marks.mark('market-8', 'Market again: every jump count follows the new rule, Oisio now 8');
  await hold(page, 5);
  await page.screenshot({ path: `${OUT}/d5c-market.png` });
  await page.goForward();
  await page.getByRole('button', { name: /Set waypoints in game/i }).waitFor();
  await page.waitForTimeout(3000);
  marks.mark('route-again', 'Route Safety, Safer, ready to send');
  await hold(page, 3);
  await pressOn(page, page.getByRole('button', { name: /Set waypoints in game/i }));
  await page.waitForTimeout(2500);
  marks.mark('waypoints-set', 'Set waypoints in game sent to the client');
  await page.screenshot({ path: `${OUT}/d5c-waypoints.png` });
  await hold(page, 5);
  const out = await rec.stop();
  marks.write(dir);
  console.log(`D5-c ${out.frames} frames ${out.seconds.toFixed(1)}s, waypoint calls ${waypoints.length}`);
});
