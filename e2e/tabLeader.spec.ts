/**
 * Tab Leader election (`src/lib/tabLeader.ts`, CONTEXT.md) against real Web
 * Locks, which its unit tests fake. Every page in one BrowserContext shares
 * the origin's lock manager, so two pages here are two tabs of the app.
 *
 * Two probes, read together:
 * - `navigator.locks.query()` is the browser's own account of who holds and
 *   who waits for `neocom:leader:<job>` — the ground truth, but it names
 *   holders only by an opaque client id.
 * - `isLeader()` of a seat joined on the page's own election singleton, via
 *   the dev server's copy of the module (the one the app imported), says
 *   which page that holder is.
 *
 * The sweep's election is joined by hand. The app only stands for it when
 * cloud sync is configured (`isSyncConfigured`), and E2E blanks Firebase, so
 * without this `neocom:leader:sweep` would never be requested at all.
 *
 * Poller requests are not counted: the first poll waits 10s after mount and
 * then reads nothing unless notifications are switched on, so a count would
 * need both a fake clock and a notification setup this spec does not own.
 */
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { signInAndGoto } from './support/authSeed';
import { expect, installMockedNetwork, test } from './support/testBase';

const POLLER_LOCK = 'neocom:leader:poller';
const SWEEP_LOCK = 'neocom:leader:sweep';
/** The URL the dev server serves the module at — the same instance the app holds. */
const TAB_LEADER_MODULE = '/src/lib/tabLeader.ts';

interface Leadership {
  poller: boolean;
  sweep: boolean;
}

interface LockCounts {
  held: Record<string, number>;
  pending: Record<string, number>;
}

/** A second tab of the same app, with the same network guard as `page`. */
async function openTab(
  context: BrowserContext,
  baseURL: string
): Promise<{ tab: Page; escaped: string[] }> {
  const tab = await context.newPage();
  const escaped = await installMockedNetwork(tab, baseURL);
  await tab.goto('./overview');
  await layoutMounted(tab);
  return { tab, escaped };
}

/**
 * The app shell is up, so the Foreground Poller has already joined its
 * election — a probe before that would start the election itself — and the
 * boot's module and data requests have drained. Without the second half the
 * spec's timings are the dev server's: under parallel workers a page still
 * fetching its modules can take seconds to run a lock callback, and one busy
 * when navigated away from misses the back/forward cache
 * (`TimeoutPuttingInCache`).
 */
async function layoutMounted(page: Page): Promise<void> {
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

/** Stand this page for the sweep, as `useBackgroundSync` does when sync is configured. */
async function joinSweep(page: Page): Promise<void> {
  await page.evaluate(async (moduleUrl) => {
    const tabLeader = await import(/* @vite-ignore */ moduleUrl);
    const w = window as unknown as { __e2eSweepSeat?: unknown };
    w.__e2eSweepSeat ??= tabLeader.joinTabElection('sweep', () => {});
  }, TAB_LEADER_MODULE);
}

/** Whether this page is currently the Tab Leader for each job. */
async function leadership(page: Page): Promise<Leadership> {
  return page.evaluate(async (moduleUrl) => {
    const tabLeader = await import(/* @vite-ignore */ moduleUrl);
    const w = window as unknown as { __e2eSweepSeat?: { isLeader(): boolean } };
    // A second seat on the poller's election, left again at once: the
    // Foreground Poller's own seat keeps that election running regardless.
    const pollerSeat = tabLeader.joinTabElection('poller', () => {});
    const poller: boolean = pollerSeat.isLeader();
    pollerSeat.leave();
    return { poller, sweep: w.__e2eSweepSeat?.isLeader() ?? false };
  }, TAB_LEADER_MODULE);
}

/**
 * How many clients (tabs) hold, and how many wait for, each leader lock.
 *
 * Clients, not queue entries. Chromium keeps a request aborted in the same
 * task that made it in `query().pending`, and StrictMode's dev-only
 * mount-unmount-mount of the Foreground Poller does exactly that, so each
 * tab's poller queue can carry one dead entry beside its live one. The module
 * already copes (a request granted after its tab gave up releases at once);
 * counting entries would only be counting that browser quirk.
 */
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
const ONE_EACH = { [POLLER_LOCK]: 1, [SWEEP_LOCK]: 1 };
const NONE = { [POLLER_LOCK]: 0, [SWEEP_LOCK]: 0 };

/**
 * Lets the spec hide a page: headless Chromium reports every page visible,
 * and nothing Playwright offers changes that. Installed before any app code,
 * so the app's `visibilityState` reads always go through it.
 */
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

/** Two tabs, the first signed in and leading both jobs before the second opens. */
async function twoTabs(page: Page, baseURL: string) {
  await signInAndGoto(page);
  await layoutMounted(page);
  await joinSweep(page);
  await expect.poll(() => leadership(page)).toEqual(LEADS);

  const second = await openTab(page.context(), baseURL);
  await joinSweep(second.tab);
  return second;
}

// The last test needs the back/forward cache, which Playwright's default
// launch refuses twice over: it passes `--disable-back-forward-cache`, and the
// headless shell it runs by default has no cache at all (Chrome reports
// `BackForwardCacheDisabledForDelegate`). `channel: 'chromium'` runs the full
// build's new headless mode instead, which CI's `playwright install chromium`
// already downloads. Both force their own worker, so they can only be set
// file-wide; the other tests never navigate back, so it is inert for them.
test.use({
  channel: 'chromium',
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
});

test.describe('Tab Leader election (real Web Locks)', () => {
  test('exactly one of two visible tabs leads each job', async ({ page, baseURL }) => {
    const { tab, escaped } = await twoTabs(page, baseURL!);

    // The second tab's requests are queued behind the first's.
    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: ONE_EACH });
    expect(await leadership(page)).toEqual(LEADS);
    expect(await leadership(tab)).toEqual(FOLLOWS);
    expect(escaped).toEqual([]);
  });

  test('a hidden leader hands both jobs to the visible tab', async ({ page, baseURL }) => {
    await page.context().addInitScript(controllableVisibility);
    const { tab, escaped } = await twoTabs(page, baseURL!);

    await setHidden(page, true);
    await expect.poll(() => leadership(tab)).toEqual(LEADS);
    expect(await leadership(page)).toEqual(FOLLOWS);
    // The hidden tab dropped its requests rather than queueing behind.
    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: NONE });

    // Visible again, it waits its turn instead of taking leadership back.
    await setHidden(page, false);
    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: ONE_EACH });
    expect(await leadership(tab)).toEqual(LEADS);
    expect(await leadership(page)).toEqual(FOLLOWS);
    expect(escaped).toEqual([]);
  });

  test('closing the leader hands both jobs to the other tab', async ({ page, baseURL }) => {
    const { tab, escaped } = await twoTabs(page, baseURL!);
    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: ONE_EACH });

    await page.close();
    // The browser frees a closed tab's locks when it tears the tab down, which
    // is usually tens of milliseconds but was seen at 3s under parallel
    // workers — hence more than the default 5s of headroom.
    await expect.poll(() => leadership(tab), { timeout: 15_000 }).toEqual(LEADS);
    await expect.poll(() => lockCounts(tab)).toEqual({ held: ONE_EACH, pending: NONE });
    expect(escaped).toEqual([]);
  });

  test('without Web Locks every tab leads', async ({ page, baseURL }) => {
    await page.context().addInitScript(() => {
      delete (Navigator.prototype as { locks?: LockManager }).locks;
    });
    const { tab, escaped } = await twoTabs(page, baseURL!);

    expect(await tab.evaluate(() => 'locks' in navigator)).toBe(false);
    expect(await leadership(page)).toEqual(LEADS);
    expect(await leadership(tab)).toEqual(LEADS);
    expect(escaped).toEqual([]);
  });
});

test.describe('Tab Leader across the back/forward cache', () => {
  test('a page restored from the cache stands for leadership again', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __e2ePageShows: boolean[] };
      w.__e2ePageShows = [];
      window.addEventListener('pageshow', (event) => w.__e2ePageShows.push(event.persisted));
    });
    await signInAndGoto(page);
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
    // A restore fires no `load`, which is what `goBack` waits for by default.
    await page.goBack({ waitUntil: 'commit' });

    // A restored page keeps its window, so it has seen a second, persisted
    // `pageshow`; a fresh load would show only its own first one. Polled with
    // Chrome's reasons alongside, so a miss fails naming why it wasn't cached.
    const pageShows = () =>
      page.evaluate(() => (window as unknown as { __e2ePageShows?: boolean[] }).__e2ePageShows);
    await expect
      .poll(async () => ({ pageShows: await pageShows(), notRestored }))
      .toEqual({ pageShows: [false, true], notRestored: [] });
    await expect.poll(() => leadership(page)).toEqual(LEADS);
    await expect.poll(() => lockCounts(page)).toEqual({ held: ONE_EACH, pending: NONE });
  });
});
