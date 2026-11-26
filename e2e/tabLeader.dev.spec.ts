import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { signInAndGoto } from './support/authSeed';
import { expect, installMockedNetwork, test } from './support/testBase';

const POLLER_LOCK = 'neocom:leader:poller';
const SWEEP_LOCK = 'neocom:leader:sweep';
const TAB_LEADER_MODULE = '/src/lib/tabLeader.ts';

interface Leadership {
  poller: boolean;
  sweep: boolean;
}

interface LockCounts {
  held: Record<string, number>;
  pending: Record<string, number>;
}

let secondTabEscapes: string[][] = [];

async function openTab(context: BrowserContext, baseURL: string): Promise<Page> {
  const tab = await context.newPage();
  secondTabEscapes.push(await installMockedNetwork(tab, baseURL));
  await tab.goto('./help');
  await layoutMounted(tab);
  return tab;
}

async function layoutMounted(page: Page): Promise<void> {
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

async function joinSweep(page: Page): Promise<void> {
  await page.evaluate(async (moduleUrl) => {
    const tabLeader = await import(moduleUrl);
    const w = window as unknown as { __e2eSweepSeat?: unknown };
    w.__e2eSweepSeat ??= tabLeader.joinTabElection('sweep', () => {});
  }, TAB_LEADER_MODULE);
}

async function leadership(page: Page): Promise<Leadership> {
  return page.evaluate(async (moduleUrl) => {
    const tabLeader = await import(moduleUrl);
    const w = window as unknown as { __e2eSweepSeat?: { isLeader(): boolean } };
    const pollerSeat = tabLeader.joinTabElection('poller', () => {});
    const poller: boolean = pollerSeat.isLeader();
    pollerSeat.leave();
    return { poller, sweep: w.__e2eSweepSeat?.isLeader() ?? false };
  }, TAB_LEADER_MODULE);
}

async function lockCounts(page: Page): Promise<LockCounts> {
  return page.evaluate(
    async (names) => {
      const snapshot = await navigator.locks.query();
      const clients = (locks: LockInfo[] | undefined) =>
        Object.fromEntries(
          names.map((name) => [
            name,
            new Set((locks ?? []).filter((l) => l.name === name).map((l) => l.clientId)).size,
          ])
        );
      return { held: clients(snapshot.held), pending: clients(snapshot.pending) };
    },
    [POLLER_LOCK, SWEEP_LOCK]
  );
}

const LEADS: Leadership = { poller: true, sweep: true };
const FOLLOWS: Leadership = { poller: false, sweep: false };
const SWEEP_ONLY: Leadership = { poller: false, sweep: true };
const POLLER_ONLY: Leadership = { poller: true, sweep: false };
const ONE_EACH = { [POLLER_LOCK]: 1, [SWEEP_LOCK]: 1 };
const NONE = { [POLLER_LOCK]: 0, [SWEEP_LOCK]: 0 };

function controllableVisibility() {
  let hidden = false;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  (window as unknown as { __e2eSetHidden: (next: boolean) => void }).__e2eSetHidden = (next) => {
    hidden = next;
    document.dispatchEvent(new Event('visibilitychange'));
  };
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((next) => {
    (window as unknown as { __e2eSetHidden: (next: boolean) => void }).__e2eSetHidden(next);
  }, hidden);
}

async function twoTabs(page: Page, baseURL: string) {
  await signInAndGoto(page, './help');
  await layoutMounted(page);
  await joinSweep(page);
  await expect.poll(() => leadership(page)).toEqual(LEADS);

  const tab = await openTab(page.context(), baseURL);
  await joinSweep(tab);
  return tab;
}

test.use({
  channel: 'chromium',
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
});

test.describe.configure({ timeout: 60_000 });

test.afterEach(() => {
  const escaped = secondTabEscapes.flat();
  secondTabEscapes = [];
  expect(escaped, `Real network reached from a second tab: ${escaped.join(', ')}`).toEqual([]);
});

test.describe('Tab Leader election (real Web Locks)', () => {
  test('exactly one of two visible tabs leads each job', async ({ page, baseURL }) => {
    const tab = await twoTabs(page, baseURL!);

    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: ONE_EACH });
    expect(await leadership(page)).toEqual(SWEEP_ONLY);
    expect(await leadership(tab)).toEqual(POLLER_ONLY);
  });

  test('a hidden leader hands both jobs to the visible tab', async ({ page, baseURL }) => {
    await page.context().addInitScript(controllableVisibility);
    const tab = await twoTabs(page, baseURL!);

    await setHidden(page, true);
    await expect.poll(() => leadership(tab)).toEqual(LEADS);
    expect(await leadership(page)).toEqual(FOLLOWS);
    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: NONE });

    await setHidden(page, false);
    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: ONE_EACH });
    expect(await leadership(tab)).toEqual(SWEEP_ONLY);
    expect(await leadership(page)).toEqual(POLLER_ONLY);
  });

  test('closing the leader hands both jobs to the other tab', async ({ page, baseURL }) => {
    const tab = await twoTabs(page, baseURL!);
    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: ONE_EACH });

    await page.close();
    await expect.poll(() => leadership(tab), { timeout: 15_000 }).toEqual(LEADS);
    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: NONE });
  });

  test('without Web Locks every tab leads', async ({ page, baseURL }) => {
    await page.context().addInitScript(() => {
      delete (Navigator.prototype as { locks?: LockManager }).locks;
    });
    const tab = await twoTabs(page, baseURL!);

    expect(await tab.evaluate(() => 'locks' in navigator)).toBe(false);
    expect(await leadership(page)).toEqual(LEADS);
    expect(await leadership(tab)).toEqual(LEADS);
  });
});

test.describe('Tab Leader across the back/forward cache', () => {
  test('a page re-acquires leadership after a back/forward cache restore', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __e2ePageShows: boolean[] };
      w.__e2ePageShows = [];
      window.addEventListener('pageshow', (event) => w.__e2ePageShows.push(event.persisted));
    });
    await signInAndGoto(page, './help');
    await layoutMounted(page);
    await joinSweep(page);
    await expect.poll(() => leadership(page)).toEqual(LEADS);

    const cdp: CDPSession = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    const notRestored: unknown[] = [];
    cdp.on('Page.backForwardCacheNotUsed', (event) =>
      notRestored.push(event.notRestoredExplanations)
    );

    await page.goto('about:blank');
    await page.goBack({ waitUntil: 'commit' });

    const pageShows = () =>
      page.evaluate(() => (window as unknown as { __e2ePageShows?: boolean[] }).__e2ePageShows);
    await expect
      .poll(async () => ({ pageShows: await pageShows(), notRestored }))
      .toEqual({ pageShows: [false, true], notRestored: [] });
    await expect.poll(() => leadership(page)).toEqual(LEADS);
    await expect.poll(() => lockCounts(page)).toEqual({ held: ONE_EACH, pending: NONE });
  });
});
