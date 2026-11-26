import { expect, vi } from 'vitest';

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realNow = Date.now.bind(Date);

const SETTLE_TIMEOUT_MS = 1000;

const ENDED = 'test ended';

export function restoreRealTimers(): void {
  if (vi.isFakeTimers()) vi.clearAllTimers();
  vi.useRealTimers();
}

type FetchPhase = 'hooks' | 'test' | 'ended';
let phase: FetchPhase = 'hooks';
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

function wrapFetch(): void {
  const inner = globalThis.fetch as TrackedFetch | undefined;
  if (typeof inner !== 'function' || inner[WRAPPED]) return;
  const tracked: TrackedFetch = (input, init) => {
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

export function beginTestFetches(): void {
  phase = 'test';
  testController = new AbortController();
  wrapFetch();
}

export function abortTestFetches(): void {
  testController?.abort(testEnded());
  testController = null;
  phase = 'ended';
}

export async function beginSuiteFetches(): Promise<void> {
  if (phase === 'ended') await settleOrWarn(undefined);
  phase = 'hooks';
}

export function endSuiteFetches(): void {
  phase = 'ended';
}

const pendingIdb = new Set<Promise<void>>();

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

export function trackIndexedDb(): void {
  if (typeof IDBFactory === 'undefined' || typeof IDBDatabase === 'undefined') return;
  const factory = IDBFactory.prototype as IDBFactory & { [WRAPPED]?: true };
  if (factory[WRAPPED]) return;
  factory[WRAPPED] = true;

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

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => realSetTimeout(resolve, 0));
}

type SettleScope = 'fetch' | 'all';

function pendingIn(scope: SettleScope): Promise<unknown>[] {
  return scope === 'fetch' ? [...pendingFetches] : [...pendingFetches, ...pendingIdb];
}

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

const FAIL_ON_LEFTOVER_WORK = process.env.VITEST_FAIL_ON_LEFTOVER_WORK === '1';

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

export function unmountAtTestEnd(cleanup: () => void): void {
  unmountRendered = cleanup;
}

export async function endTestWork(): Promise<void> {
  unmountRendered?.();
  abortTestFetches();
  await settleOrWarn(expect.getState().currentTestName, vi.isFakeTimers() ? 'fetch' : 'all');
}

export const END_TEST_WORK = Symbol.for('neocom-desk.endTestWork');
export const BEGIN_SUITE_FETCHES = Symbol.for('neocom-desk.beginSuiteFetches');
export const END_SUITE_FETCHES = Symbol.for('neocom-desk.endSuiteFetches');
(globalThis as Record<symbol, unknown>)[END_TEST_WORK] = endTestWork;
(globalThis as Record<symbol, unknown>)[BEGIN_SUITE_FETCHES] = beginSuiteFetches;
(globalThis as Record<symbol, unknown>)[END_SUITE_FETCHES] = endSuiteFetches;
