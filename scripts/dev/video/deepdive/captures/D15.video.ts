import { test, type Page } from '@playwright/test';
import { hideSandboxNoise } from '../../recorder';
import { openWorld } from '../world';
import { record } from '../mocks/D15-rec';
import { dangerRow, feedIds, putFeed, seedRows } from '../mocks/D15-seed';

test.setTimeout(600_000);

async function open(
  page: Page,
  path: string,
  active: 'arden' | 'mira' | 'tobin' = 'arden',
  seed = true
) {
  await hideSandboxNoise(page);
  await page.context().grantPermissions(['notifications']);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await openWorld(page, path, { active });
  await page.waitForTimeout(6000);
  if (seed) await putFeed(page, seedRows());
  await page.waitForTimeout(3000);
  console.log('FEED', JSON.stringify(await feedIds(page)));
}

const bellButton = (page: Page) => page.getByRole('button', { name: /^Alerts, / });

test('D15-a the bell', async ({ page }) => {
  await open(page, './overview');
  const box = await bellButton(page).boundingBox();
  console.log('BELL', JSON.stringify(box));
  await record(page, 'D15-a', async (t) => {
    t.mark('overview', 'Overview with the bell badge showing the waiting alerts');
    await t.hold(5000);
    await t.click(bellButton(page));
    await t.settle(500);
    t.mark('bell-open', 'Bell popover open: alerts grouped by type');
    await t.hold(4000);
    const undercut = page
      .getByRole('listitem')
      .filter({ hasText: 'Market order undercut' })
      .first();
    await t.hover(undercut.locator('time').first());
    t.mark('eve-time', 'Tooltip on a group age: EVE time');
    await t.hold(4000);
    await t.click(page.getByRole('button', { name: /^Market order undercut, 3 alerts/ }));
    t.mark('undercut-expand', 'Order undercut group expanded: one fire per order');
    await t.hold(4500);
    await t.click(page.getByRole('link', { name: /Retriever sell order/ }));
    t.mark('click-mira', "Mira's Retriever fire clicked");
    await page.getByText('Retriever').first().waitFor();
    await t.settle(2500);
    t.mark('orders-mira', 'Market Orders with the Retriever row highlighted, switched to Mira');
    await t.hold(5000);
    await t.click(bellButton(page));
    await t.settle(500);
    await t.hold(1500);
    await t.click(page.getByRole('button', { name: 'Dismiss New mail' }));
    t.mark('dismiss-mail', 'Check mark on New mail pressed');
    await t.hold(600);
    t.mark('undo-toast', 'Toast "New mail dismissed" with Undo');
    await t.hold(4000);
  });
});

test('D15-b danger', async ({ page }) => {
  await open(page, './overview');
  await record(page, 'D15-b', async (t) => {
    t.mark('calm', 'Overview before the attack, bell blue');
    await t.hold(3000);
    await putFeed(page, [dangerRow()], false);
    await page
      .getByRole('button', { name: 'Acknowledge Structure under attack' })
      .first()
      .waitFor();
    t.mark(
      'danger-in',
      'Danger alert arrives: bell turns red, danger banner at the top of the Overview'
    );
    await t.hold(5000);
    await t.click(page.getByRole('button', { name: 'Acknowledge Structure under attack' }).first());
    t.mark('acknowledge', 'Acknowledge pressed: banner gone, bell back to blue');
    await t.hold(3000);
  });
});

test('D15-e push click-through', async ({ page }) => {
  await open(page, './overview');
  await record(page, 'D15-e', async (t) => {
    await t.glidePoint(1410, 24, 800);
    t.mark(
      'toast-bg',
      'Calm Overview, cursor resting top-right (the editor draws the desktop notification)'
    );
    await t.hold(7000);
    t.mark('toast-click', 'Small click at the top-right (clicking the notification)');
    await t.clickPoint();
    await page.goto('./skills/plans?character=90000012');
    await page.getByText('Switched to Tobin Raske').first().waitFor();
    await bellButton(page).waitFor();
    await t.hold(2500);
    t.mark('switched-tobin', 'Skills page on Tobin with the Switched to Tobin Raske status');
    await t.hold(5000);
    await t.click(bellButton(page));
    await t.settle(500);
    t.mark('push-on', 'Bell popover footer: Push on this device: On');
    await t.hold(3000);
  });
});

test('D15-c stop the noise and settings', async ({ page }) => {
  await open(page, './overview');
  await record(page, 'D15-c', async (t) => {
    await t.hold(1500);
    await t.click(bellButton(page));
    await t.settle(500);
    t.mark('bell-open', 'Bell popover open');
    await t.hold(2000);
    const wallet = page.getByRole('listitem').filter({ hasText: 'Wallet balance changed' }).first();
    await t.click(wallet.getByRole('button', { name: /more actions/i }));
    await page.getByRole('menuitem', { name: 'Stop these alerts' }).waitFor();
    t.mark(
      'wallet-menu',
      'More actions menu on Wallet balance changed: Snooze 1h, Stop these alerts, Notification settings'
    );
    await t.hold(3200);
    await t.click(page.getByRole('menuitem', { name: 'Stop these alerts' }));
    await page.getByText('Wallet balance changed alerts off for all characters').waitFor();
    t.mark(
      'stop',
      'Wallet row gone; toast "Wallet balance changed alerts off for all characters" with Undo'
    );
    await t.hold(4500);
    const skill = page.getByRole('listitem').filter({ hasText: 'Skill queue ending' }).first();
    await t.rightClick(skill.getByText('Skill queue ending', { exact: true }));
    await page.getByRole('menuitem', { name: 'Notification settings' }).waitFor();
    t.mark('context-menu', 'Right-click on Skill queue ending: the same menu as a context menu');
    await t.hold(3200);
    await t.click(page.getByRole('menuitem', { name: 'Notification settings' }));
    await page.getByPlaceholder('Search events or characters').waitFor();
    await t.settle(1500);
    t.mark('to-settings', 'Settings > Notifications opened');
    t.mark(
      'settings-search',
      'Search box filled with "Skill queue ending", only that event listed'
    );
    await t.hold(5000);
    const search = page.getByPlaceholder('Search events or characters');
    await t.click(search);
    await page.keyboard.press('Control+A');
    await t.hold(400);
    await page.keyboard.press('Backspace');
    await page
      .getByRole('tab', { name: /Skills/ })
      .first()
      .waitFor();
    await t.hold(1200);
    t.mark('clear-search', 'Search cleared: all events by topic');
    await t.hold(3000);
    await t.hover(page.locator('main').getByText('Device', { exact: true }).first());
    t.mark('columns', 'Device and Alerts column headings');
    await t.hold(2500);
    await t.hover(page.locator('main').getByText('Alerts', { exact: true }).first());
    await t.hold(2500);
    for (const name of [
      /^Skills/,
      /^Industry and PI/,
      /^Market and contracts/,
      /^Mail and calendar/,
      /^Space and community/,
    ]) {
      await t.hover(page.getByRole('tab', { name }).first(), 900);
      if (name.source === '^Skills')
        t.mark(
          'topics',
          'Topic tabs: Skills, Industry and PI, Market and contracts, Mail and calendar, Space and community'
        );
      await t.hold(700);
    }
    await t.click(page.getByRole('tab', { name: /^Skills/ }).first());
    t.mark('skills-tab', 'Skills topic: events with Device, Alerts and Warn ahead');
    await t.hold(4000);
    await t.click(page.getByRole('button', { name: /Warn-ahead times/ }).first());
    t.mark('per-character', 'Warn-ahead times expanded: each character on its own row');
    await t.hold(4500);
    const mira = page.getByRole('combobox').nth(1);
    await t.click(mira);
    await page.getByRole('option', { name: '48 hours' }).waitFor();
    await t.hold(2000);
    await t.click(page.getByRole('option', { name: '48 hours' }));
    t.mark('mira-48', 'Mira Voskane warn-ahead set to 48 hours');
    await t.hold(4500);
  });
});

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

test.describe('phone', () => {
  test.use({
    viewport: { width: 405, height: 720 },
    deviceScaleFactor: 2.667,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  });

  test('D15-p1 phone swipe', async ({ page }) => {
    await open(page, './overview');
    await record(
      page,
      'D15-p1',
      async (t) => {
        await t.hold(2500);
        await t.tap(bellButton(page));
        await page
          .getByRole('heading', { name: /^Alerts, \d+ new/ })
          .first()
          .waitFor();
        await t.settle(500);
        t.mark('bell-sheet', 'Bell opened as a full-screen sheet');
        await t.hold(4000);
        const row = page
          .getByRole('listitem')
          .filter({ hasText: 'Wallet balance changed' })
          .first();
        await row.scrollIntoViewIfNeeded();
        await t.hold(1500);
        t.mark('swipe-start', 'About to swipe the Wallet balance changed row left');
        await t.swipeLeft(row, 190, 2200);
        t.mark('swipe', 'Row swiped away; toast with Undo');
        await t.hold(4500);
      },
      { phone: true }
    );
  });

  test('D15-p3 device per device', async ({ page }) => {
    await open(page, './settings/notifications', 'arden', false);
    await record(
      page,
      'D15-p3',
      async (t) => {
        await t.hold(2500);
        t.mark('topics-phone', 'Settings > Notifications topic list on the phone');
        await t.hold(3500);
        await t.tap(page.getByRole('button', { name: /Skills/ }).first());
        await t.settle(800);
        t.mark('skills-phone', 'Skills topic: events with Device and Alerts boxes');
        await t.hold(4000);
        const device = page.getByRole('checkbox', { name: /device notifications/ });
        const n = await device.count();
        console.log('DEVICE BOXES', n);
        for (const i of [0, 1, 2]) {
          await t.tap(device.nth(i));
          await t.hold(1200);
        }
        t.mark('untick-device', 'Device unticked on three events while Alerts stays ticked');
        await t.hold(4500);
      },
      { phone: true }
    );
  });
});

test.describe('iphone', () => {
  test.use({
    viewport: { width: 405, height: 720 },
    deviceScaleFactor: 2.667,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
  });

  test('D15-p2 iphone install note', async ({ page }) => {
    await hideSandboxNoise(page);
    await openWorld(page, './settings/notifications', { active: 'arden' });
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
      for (const a of document.querySelectorAll('a,button'))
        if (a.textContent?.includes('installRequiredLink'))
          (a as HTMLElement).style.display = 'none';
    });
    await record(
      page,
      'D15-p2',
      async (t) => {
        await t.hold(1500);
        t.mark('iphone-note', 'Settings > Notifications with the On iPhone and iPad install note');
        await t.hold(5000);
      },
      { phone: true }
    );
  });
});
