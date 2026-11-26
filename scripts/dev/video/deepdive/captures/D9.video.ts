/** D9: Assets by place sorted by jumps, the ore dialog (D9-a); the Move planner end to end (D9-b). */
import { test, type Page } from '@playwright/test';
import { hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { installD5Danger } from '../mocks/D5-route';
import { installD9, where } from '../mocks/D9-ore';
import { hold, Marks, pointAt, pressOn, smoothScroll, typeSlowly } from '../mocks/D5-kit';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D9';

async function open(page: Page, path: string) {
  await hideSandboxNoise(page);
  await openWorld(page, path, {
    settings: [{ key: 'sync.routePreference', value: 'shortest' }],
    before: async (p) => {
      await installD5Danger(p);
      await installD9(p);
    },
  });
}

test.describe.configure({ mode: 'serial' });

test('D9-a assets by place and the ore dialog', async ({ page }) => {
  await open(page, './assets');
  await page.getByText('Tunttaras 10').first().waitFor();
  await page.waitForTimeout(4000);
  await placePointer(page, 1000, 650);
  const dir = `${OUT}/D9-a`;
  const rec = await startRecording(page, dir);
  const marks = new Marks();
  await page.waitForTimeout(2000);
  marks.mark('by-place', 'Assets: one row per place with jumps away, items and value');
  await hold(page, 4);
  marks.anchor();
  const sort = page.getByRole('combobox', { name: /sort/i }).or(page.getByRole('button', { name: /^Name/ })).first();
  await pressOn(page, sort);
  await page.waitForTimeout(800);
  await pressOn(page, page.getByRole('option', { name: 'Jumps away' }), 900);
  await page.waitForTimeout(2000);
  marks.mark('sorted-jumps', 'Sorted by jumps away: Nourvukaiken 0, Tunttaras 1, Jita 3, Amarr 12');
  await hold(page, 4.5);
  await pressOn(page, page.getByText('Tunttaras 10 - Moon 3').first());
  await page.waitForTimeout(2500);
  marks.mark('place-open', 'Tunttaras opened: the items there, incl. the ore stacks');
  await page.screenshot({ path: `${OUT}/d9a-open.png` });
  await hold(page, 4);
  const oreRow = page.getByRole('row').filter({ hasText: 'Veldspar' }).first().or(page.locator('li, div').filter({ hasText: /^Veldspar/ }).first());
  const menu = page.getByRole('button', { name: /More actions.*Veldspar|Veldspar.*actions/i }).first();
  await pressOn(page, menu);
  await page.waitForTimeout(1200);
  marks.mark('ore-menu', 'ore stack menu: What to do with this ore');
  await page.screenshot({ path: `${OUT}/d9a-menu.png` });
  await hold(page, 3.5);
  await pressOn(page, page.getByRole('menuitem', { name: 'What to do with this ore' }), 900);
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(3500);
  marks.mark('ore-dialog', 'What to do with Veldspar: sell raw vs refine then sell');
  await page.screenshot({ path: `${OUT}/d9a-ore.png` });
  await hold(page, 6);
  const out = await rec.stop();
  marks.write(dir);
  console.log(`D9-a ${out.frames} frames ${out.seconds.toFixed(1)}s`);
});

test('D9-b move planner', async ({ page }) => {
  await open(page, './assets/move');
  await page.getByText('What to move').waitFor();
  await page.locator('header button, main button').filter({ has: page.locator('img') }).first().click();
  await page.getByText(/All characters/).first().click();
  await page.getByText('Tobin Raske').first().waitFor();
  await page.waitForTimeout(3000);
  await placePointer(page, 1000, 700);
  const dir = `${OUT}/D9-b`;
  const rec = await startRecording(page, dir);
  const marks = new Marks();
  await page.waitForTimeout(2000);
  marks.mark('move-start', 'Assets > Move: What to move lists the stock per character and place');
  await hold(page, 4);
  marks.anchor();
  const pick = (place: string, who: string) =>
    page.getByRole('checkbox', { name: new RegExp(`Select everything at ${place}.* for ${who}`) });
  await pressOn(page, pick('Jita 4', 'Arden Kessil'));
  await hold(page, 1.5);
  await pressOn(page, pick('Tunttaras 10', 'Arden Kessil'));
  await hold(page, 1.5);
  await pressOn(page, pick('Nourvukaiken 3', 'Mira Voskane'));
  await page.waitForTimeout(1500);
  marks.mark('picked', 'Stock picked from three stations: Jita, Tunttaras and Nourvukaiken');
  await hold(page, 4);
  await pressOn(page, page.getByRole('button', { name: /Pick a system/i }));
  await page.waitForTimeout(800);
  await typeSlowly(page, 'Sarekuwa');
  await page.waitForTimeout(1500);
  await pressOn(page, page.getByRole('option', { name: /Sarekuwa/ }).first(), 900);
  await page.waitForTimeout(2000);
  marks.mark('deliver-to', 'Deliver to Sarekuwa, the staging system');
  await hold(page, 4);
  await pressOn(page, page.getByRole('button', { name: /Show plan/i }));
  await page.getByText('Haul', { exact: false }).first().waitFor();
  await page.waitForTimeout(3500);
  marks.mark('plan', 'Show plan: trips, haulers, volume and what each haul carries');
  await hold(page, 4.5);
  await pressOn(page, page.getByRole('radio', { name: /Occator/ }));
  await page.waitForTimeout(2000);
  marks.mark('hauler', "Hauler: Occator, Tobin's ship, marked Owned");
  await page.screenshot({ path: `${OUT}/d9b-hauler.png` });
  await hold(page, 4);
  const cap = page.getByRole('textbox', { name: /Cap per haul/i }).or(page.getByLabel(/Cap per haul/i)).first();
  await pressOn(page, cap);
  await typeSlowly(page, '30000000');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(2500);
  marks.mark('cap', 'Cap per haul 30,000,000: the hauls split by value');
  await page.screenshot({ path: `${OUT}/d9b-cap.png` });
  await hold(page, 4);
  await pressOn(page, page.getByRole('button', { name: /Show my route/i }));
  await page.getByText(/Set All Waypoints/i).first().waitFor();
  await page.waitForTimeout(3500);
  marks.mark('legs', 'Show my route: legs, each with jumps, highsec or lowsec count and a security strip');
  await page.screenshot({ path: `${OUT}/d9b-legs.png` });
  await hold(page, 4.5);
  await pointAt(page, page.getByRole('link', { name: /Show in Route Safety, leg/ }).first());
  marks.mark('leg-route-safety', 'Route Safety shortcut on a leg');
  await hold(page, 3.5);
  await smoothScroll(page, 520);
  await hold(page, 4);
  const setAll = page.getByRole('button', { name: /Set All Waypoints/i }).first();
  await setAll.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await pressOn(page, setAll);
  await page.waitForTimeout(2500);
  marks.mark('set-all', 'Set All Waypoints sent to the game client');
  await page.screenshot({ path: `${OUT}/d9b-setall.png` });
  await hold(page, 4.5);
  // leave, then come back: the haul is kept
  await pressOn(page, page.getByRole('tab', { name: 'Items' }).or(page.getByRole('main').getByRole('link', { name: 'Items', exact: true })).first());
  await page.waitForTimeout(2500);
  where.systemId = 30000142;
  where.stationId = 60003760;
  marks.mark('moved', 'the pilot has docked at Jita (mocked location changed)');
  await pressOn(page, page.getByRole('tab', { name: 'Move' }).or(page.getByRole('main').getByRole('link', { name: 'Move', exact: true })).first());
  await page.waitForTimeout(3000);
  marks.mark('haul-in-progress', 'Haul in progress, resume');
  await page.screenshot({ path: `${OUT}/d9b-progress.png` });
  await hold(page, 4);
  const resume = page.getByRole('button', { name: /Haul in progress/i }).first();
  if (await resume.count()) await pressOn(page, resume);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/d9b-resume.png` });
  marks.mark('mark-done-prompt', 'Your Current System is where leg 1 ends. Mark it done?');
  await hold(page, 5);
  const mark = page.getByRole('button', { name: /Mark done/i }).first();
  if (await mark.count()) {
    await pressOn(page, mark);
    await page.waitForTimeout(2000);
    marks.mark('marked-done', 'Leg ticked off');
    await hold(page, 4);
  }
  await page.screenshot({ path: `${OUT}/d9b-end.png` });
  const out = await rec.stop();
  marks.write(dir);
  console.log(`D9-b ${out.frames} frames ${out.seconds.toFixed(1)}s`);
});
