/**
 * Test-end teardown shared by both vitest projects (`vitest.setup.ts`,
 * `vitest.setup.dom.ts`): nothing a test started may still be running when the
 * next one begins, or after the file's environment is gone.
 *
 * Three kinds of work outlive a test on their own:
 *
 * - **Fake timers / a frozen `Date`** left on by a test that never restored
 *   them, which every later test in the file then runs under.
 * - **`fetch` still in flight.** Its late response writes into `esiCache` or
 *   Dexie after the next test's reset, or calls `setState` after jsdom is torn
 *   down ("window is not defined"). Every `fetch` a test makes carries a
 *   test-scoped signal that is aborted when the test ends; MSW honours it for
 *   mocked responses too, so the caller's promise rejects even when the
 *   handler is parked on a deferred that never resolves.
 * - **`fetch` a test's work starts after the test ended** — a load still
 *   awaiting IndexedDB or a token when the body returned. It is refused with
 *   the same `AbortError`, never sent: sent untracked, it parked on the ended
 *   test's never-resolving handler until the ESI client's 30s timeout, and
 *   every later test's same-key load deduped onto it (#6188).
 * - **IndexedDB requests and transactions** (Dexie writes, and Firebase's
 *   heartbeat probe, whose `onsuccess` reads `self` — "self is not defined"
 *   once jsdom is gone). Opens, deletes and transactions are tracked until they
 *   finish, and the test waits for them.
 *
 * Production code is untouched: the hooks wrap the globals tests run against.
 *
 * Order matters. `vitest.runner.ts` calls `endTestWork` as soon as the test
 * body finishes, **before** any `afterEach`: an aborted request is a failure to
 * the app (a price source marked down, a fallback taken), and the test file's
 * own `afterEach` resets have to run after that, not before. Then the shared
 * `afterEach` in `vitest.setup.ts` restores timers and settles whatever the
 * file's hooks started.
 */
import { expect, vi } from 'vitest';

// Captured before any test can fake them: the waits below must run on real
// time even when a test left fake timers on.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realNow = Date.now.bind(Date);

/** How long a test's leftover work may take to finish before it's reported. */
const SETTLE_TIMEOUT_MS = 1000;

const ENDED = 'test ended';

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

/** Drops pending fake timers, then puts real timers and the real `Date` back. */
export function restoreRealTimers(): void {
  // Cleared first, so no faked callback fires into the next test.
  if (vi.isFakeTimers()) vi.clearAllTimers();
  // Unconditional: it also undoes a bare `vi.setSystemTime` (a mocked `Date`
  // without fake timers), which `isFakeTimers()` doesn't report.
  vi.useRealTimers();
}

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------

/**
 * Who a `fetch` belongs to right now:
 *
 * - `hooks` — a suite's `beforeAll` (a warm-up render, seeding) before its
 *   first test: the request runs untracked.
 * - `test` — the running test, from its `beforeEach` to the end of its body:
 *   the request carries `testController`'s signal.
 * - `ended` — after a test's body, until the next test's `beforeEach` or the
 *   next suite's `beforeAll`: whatever starts a request here is the ended
 *   test's leftover work (no `afterEach` or `afterAll` in the repo fetches),
 *   so it is refused.
 */
type FetchPhase = 'hooks' | 'test' | 'ended';
let phase: FetchPhase = 'hooks';
/** The running test's; `null` outside the `test` phase. */
let testController: AbortController | null = null;
const pendingFetches = new Set<Promise<unknown>>();
const WRAPPED = Symbol('teardown-wrapped-fetch');

type TrackedFetch = typeof fetch & { [WRAPPED]?: true };

function testEnded(): DOMException {
  return new DOMException(ENDED, 'AbortError');
}

function callerSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined {
  if (init?.signal) return init.signal;
  return typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined;
}

/**
 * Wraps whatever `fetch` is current — MSW's interceptor when the file has a
 * server, since its `beforeAll` has already run. Called before each test: a
 * `vi.stubGlobal('fetch', ...)` replaces the wrapper for that test only, and
 * `unstubGlobals` puts it back, so it is wrapped at most once.
 */
function wrapFetch(): void {
  const inner = globalThis.fetch as TrackedFetch | undefined;
  if (typeof inner !== 'function' || inner[WRAPPED]) return;
  const tracked: TrackedFetch = (input, init) => {
    // Rejected as an aborted in-flight request would be, so the app takes the
    // same path either way.
    if (phase === 'ended') return Promise.reject(testEnded());
    const controller = testController;
    if (controller === null) return inner(input, init);
    const own = callerSignal(input, init);
    const signal = own ? AbortSignal.any([controller.signal, own]) : controller.signal;
    const promise = inner(input, { ...init, signal });
    pendingFetches.add(promise);
    const forget = () => pendingFetches.delete(promise);
    promise.then(forget, forget);
    return promise;
  };
  tracked[WRAPPED] = true;
  globalThis.fetch = tracked;
}

/** Before each test: a fresh signal for its requests. */
export function beginTestFetches(): void {
  phase = 'test';
  testController = new AbortController();
  wrapFetch();
}

/**
 * Aborts every request the test still has in flight, and refuses any it
 * starts from now until the next test or suite begins.
 */
export function abortTestFetches(): void {
  testController?.abort(testEnded());
  testController = null;
  phase = 'ended';
}

/**
 * A suite is starting: its `beforeAll` may fetch (a warm-up render), and runs
 * untracked. When a test has just ended, its leftover work is drained first,
 * while it is still refused: the last test of a `describe` gets the same
 * window as any other. Called by `vitest.runner.ts`.
 */
export async function beginSuiteFetches(): Promise<void> {
  if (phase === 'ended') await settleOrWarn(undefined);
  phase = 'hooks';
}

/**
 * A nested suite finished: what runs next (a sibling suite's start, the
 * parent's `afterAll`) is past its last test, so leftovers stay refused.
 */
export function endSuiteFetches(): void {
  phase = 'ended';
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

const pendingIdb = new Set<Promise<void>>();

/** Tracks `target` until the first of `events` fires on it. */
function trackUntil(target: EventTarget, events: readonly string[]): void {
  const done = new Promise<void>((resolve) => {
    const finish = () => {
      for (const event of events) target.removeEventListener(event, finish);
      resolve();
    };
    for (const event of events) target.addEventListener(event, finish);
  });
  pendingIdb.add(done);
  void done.then(() => pendingIdb.delete(done));
}

/**
 * Patches `fake-indexeddb`'s prototypes (installed as the globals by
 * `fake-indexeddb/auto`, which must be imported first). Dexie and Firebase
 * both reach IndexedDB through these. Idempotent.
 */
export function trackIndexedDb(): void {
  if (typeof IDBFactory === 'undefined' || typeof IDBDatabase === 'undefined') return;
  const factory = IDBFactory.prototype as IDBFactory & { [WRAPPED]?: true };
  if (factory[WRAPPED]) return;
  factory[WRAPPED] = true;

  // `blocked` ends tracking too: a blocked open waits on another connection to
  // close, which may be exactly what the test left open.
  const requestEnds = ['success', 'error', 'blocked'] as const;
  const open = factory.open;
  factory.open = function trackedOpen(this: IDBFactory, ...args: Parameters<IDBFactory['open']>) {
    const request = open.apply(this, args);
    trackUntil(request, requestEnds);
    return request;
  };
  const deleteDatabase = factory.deleteDatabase;
  factory.deleteDatabase = function trackedDelete(
    this: IDBFactory,
    ...args: Parameters<IDBFactory['deleteDatabase']>
  ) {
    const request = deleteDatabase.apply(this, args);
    trackUntil(request, requestEnds);
    return request;
  };

  const database = IDBDatabase.prototype;
  const transaction = database.transaction;
  database.transaction = function trackedTransaction(
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    const tx = transaction.apply(this, args);
    trackUntil(tx, ['complete', 'abort']);
    return tx;
  } as IDBDatabase['transaction'];
}

// ---------------------------------------------------------------------------
// Settle
// ---------------------------------------------------------------------------

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => realSetTimeout(resolve, 0));
}

/** What a settle waits on: requests only, or requests and IndexedDB. */
type SettleScope = 'fetch' | 'all';

function pendingIn(scope: SettleScope): Promise<unknown>[] {
  return scope === 'fetch' ? [...pendingFetches] : [...pendingFetches, ...pendingIdb];
}

/**
 * Resolves once no tracked work in `scope` is left, and none starts within one
 * macrotask of the last finishing (a request's continuation often opens the
 * transaction that writes its result). Throws after `timeoutMs`, with what is
 * still pending.
 */
export async function settlePendingWork(
  scope: SettleScope = 'all',
  timeoutMs = SETTLE_TIMEOUT_MS
): Promise<void> {
  const deadline = realNow() + timeoutMs;
  for (;;) {
    const pending = pendingIn(scope);
    if (pending.length === 0) {
      await nextMacrotask();
      if (pendingIn(scope).length === 0) return;
      continue;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = realSetTimeout(() => resolve('timeout'), Math.max(deadline - realNow(), 0));
    });
    const outcome = await Promise.race([
      Promise.allSettled(pending).then(() => 'settled' as const),
      timedOut,
    ]);
    realClearTimeout(timer);
    if (outcome === 'timeout') {
      throw new Error(
        `still pending after ${timeoutMs}ms: ${pendingFetches.size} fetch, ${pendingIdb.size} IndexedDB`
      );
    }
  }
}

/**
 * With `VITEST_FAIL_ON_LEFTOVER_WORK=1`, a test whose work outlives it by
 * `SETTLE_TIMEOUT_MS` fails instead of warning. CI's unit shards set it
 * (`.github/workflows/ci.yml`); a local run only warns unless you set it too.
 * The usual cause under fake timers is a faked `setImmediate`: see "Teardown is
 * deterministic" in `docs/agents/testing-and-ci.md`.
 */
const FAIL_ON_LEFTOVER_WORK = process.env.VITEST_FAIL_ON_LEFTOVER_WORK === '1';

/**
 * `settlePendingWork`, reporting a timeout naming the test: a warning, or a
 * thrown error (failing that test, or the suite at file teardown) when
 * `FAIL_ON_LEFTOVER_WORK` is on.
 */
export async function settleOrWarn(
  testName: string | undefined,
  scope: SettleScope = 'all',
  fail = FAIL_ON_LEFTOVER_WORK
): Promise<void> {
  try {
    await settlePendingWork(scope);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `[teardown] ${testName ?? '(file teardown)'}: ${reason}`;
    if (fail)
      throw new Error(`${message}. Await or stop the work the test started.`, { cause: error });
    console.warn(message);
  }
}

let unmountRendered: (() => void) | null = null;

/** The dom project's Testing Library `cleanup`, run first at every test's end. */
export function unmountAtTestEnd(cleanup: () => void): void {
  unmountRendered = cleanup;
}

/**
 * The runner's step between the test body and its `afterEach` hooks. Unmount
 * first: a UI left mounted while the step waits keeps running (a settings
 * load hydrating, an effect calling a mock the next test has reset). Then
 * abort the test's requests and let their rejections land, so the file's own
 * resets run after them.
 *
 * IndexedDB is drained here too, so a load that was still reading a token or
 * a cached row reaches its `fetch` now, is refused, and fails before the
 * file's resets rather than after them (a price source marked down for the
 * next test). Not under fake timers: `fake-indexeddb` runs on `setImmediate`,
 * which a test may have faked; the shared `afterEach` drains it on real ones.
 */
export async function endTestWork(): Promise<void> {
  unmountRendered?.();
  abortTestFetches();
  await settleOrWarn(expect.getState().currentTestName, vi.isFakeTimers() ? 'fetch' : 'all');
}

/** How `vitest.runner.ts` reaches this module's state without importing it. */
export const END_TEST_WORK = Symbol.for('neocom-desk.endTestWork');
export const BEGIN_SUITE_FETCHES = Symbol.for('neocom-desk.beginSuiteFetches');
export const END_SUITE_FETCHES = Symbol.for('neocom-desk.endSuiteFetches');
(globalThis as Record<symbol, unknown>)[END_TEST_WORK] = endTestWork;
(globalThis as Record<symbol, unknown>)[BEGIN_SUITE_FETCHES] = beginSuiteFetches;
(globalThis as Record<symbol, unknown>)[END_SUITE_FETCHES] = endSuiteFetches;
