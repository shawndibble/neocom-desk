import { test, type Page } from '@playwright/test';
import { hideSandboxNoise } from '../../recorder';
import { openWorld } from '../world';
import { record } from '../mocks/D15-rec';
import { putFeed, seedRows } from '../mocks/D15-seed';
import { ARDEN } from '../cast';

test.use({ baseURL: 'http://localhost:5174/', locale: 'en-GB' });
test.setTimeout(600_000);

async function seedGrant(page: Page) {
  await page.evaluate(async (id) => {
    const m = await import('/src/db/index.ts');
    await m.db.settings.put({
      key: 'alertsGrants',
      value: { [id]: { status: 'active', enabledAt: Date.now() - 86_400_000 } },
    });
  }, ARDEN.id);
}

test('D15-f alerts when closed and quiet time', async ({ page }) => {
  await hideSandboxNoise(page);
  await page.context().grantPermissions(['notifications']);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await openWorld(page, './settings/notifications', { active: 'arden' });
  await page.waitForTimeout(6000);
  await putFeed(page, seedRows());
  await seedGrant(page);
  await page.addStyleTag({ content: '[data-sync-state]{display:none!important}' });
  await page.waitForTimeout(3000);
  const main = page.locator('main');
  await record(page, 'D15-f', async (t) => {
    await t.hold(2500);
    await t.hover(main.getByRole('tab', { name: /^Skills/ }).first());
    await t.hover(
      main.getByText('Skill queue ending', { exact: true }).first().locator('xpath=following::*[1]')
    );
    t.mark('scheduled-icon', 'Scheduled-push icon next to Skill queue ending: tooltip');
    await t.hold(4500);
    await t.hover(main.getByText('Alerts when closed:'));
    t.mark('awc-line', 'Alerts when closed line with its Manage button');
    await t.hold(3500);
    await t.click(main.getByRole('button', { name: 'Manage Alerts when closed' }));
    await page.getByRole('dialog').waitFor();
    await t.settle(500);
    t.mark('awc-dialog', 'Manage dialog: per-character rows');
    await t.hold(4500);
    const login = page
      .getByRole('dialog')
      .getByRole('button', { name: /^Log Mira Voskane in to EVE/ })
      .first();
    await t.click(login);
    await page.getByText(/Here is what the login/).waitFor();
    await t.settle(500);
    t.mark('awc-confirm', 'Confirm dialog: what the login asks for and why');
    await t.hold(5200);
    await t.click(page.getByRole('button', { name: 'Back' }));
    await t.hold(2500);
    await t.click(page.getByRole('checkbox', { name: 'Quiet time' }));
    await page.getByLabel('From').waitFor();
    t.mark('quiet-on', 'Quiet time ticked');
    await t.hold(2500);
    await t.click(page.getByLabel('From'));
    await page.getByLabel('From').fill('22:00');
    await t.hold(1500);
    await t.click(page.getByLabel('To', { exact: true }));
    await page.getByLabel('To', { exact: true }).fill('07:00');
    t.mark('quiet-times', 'From 22:00 To 07:00');
    await t.hold(3500);
    await t.click(page.getByRole('checkbox', { name: 'Let attacks through' }));
    await t.hold(600);
    t.mark('attacks-through', 'Let attacks through ticked');
    await t.hold(4500);
  });
});
