import { useSyncExternalStore } from 'react';

/**
 * One shared wall clock per cadence, instead of one `setInterval` per
 * component. Dozens of `DataAgeBadge`s (and every countdown) on a screen used
 * to run dozens of timers that each re-rendered on their own schedule; now
 * each cadence has a single interval that runs only while something is
 * subscribed, pauses while the tab is hidden, and ticks straight away when
 * it becomes visible again so nothing shows an age from before the tab was
 * backgrounded.
 *
 * `Date.now()` is impure, so components read it through `useTicker` rather
 * than in a render body (react-hooks/purity).
 */

interface Ticker {
  intervalMs: number;
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
}

const tickers = new Map<number, Ticker>();
let subscribedTickers = 0;

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

function publish(ticker: Ticker, now: number) {
  ticker.now = now;
  for (const listener of ticker.listeners) listener();
}

function start(ticker: Ticker) {
  if (ticker.timer !== null || isHidden()) return;
  ticker.timer = setInterval(() => publish(ticker, Date.now()), ticker.intervalMs);
}

function stop(ticker: Ticker) {
  if (ticker.timer === null) return;
  clearInterval(ticker.timer);
  ticker.timer = null;
}

function onVisibilityChange() {
  for (const ticker of tickers.values()) {
    if (ticker.listeners.size === 0) continue;
    if (isHidden()) {
      stop(ticker);
    } else {
      publish(ticker, Date.now());
      start(ticker);
    }
  }
}

function tickerFor(intervalMs: number): Ticker {
  const existing = tickers.get(intervalMs);
  if (existing) return existing;
  const ticker: Ticker = {
    intervalMs,
    now: Date.now(),
    listeners: new Set(),
    timer: null,
    subscribe: (listener) => {
      if (ticker.listeners.size === 0) {
        // Waking from idle: whatever `now` was when the last subscriber left
        // is stale. React re-reads the snapshot after subscribing, so the
        // fresh value reaches this first subscriber too.
        ticker.now = Date.now();
        if (subscribedTickers++ === 0 && typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisibilityChange);
        }
      }
      ticker.listeners.add(listener);
      start(ticker);
      return () => {
        if (!ticker.listeners.delete(listener) || ticker.listeners.size > 0) return;
        stop(ticker);
        if (--subscribedTickers === 0 && typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibilityChange);
        }
      };
    },
    getSnapshot: () => {
      // A reader arriving while the clock is idle or paused must not see a
      // value more than one cadence old (or from the future, if the system
      // clock moved back). Resyncing leaves the next call's result identical,
      // which is all `useSyncExternalStore` asks of a snapshot.
      const current = Date.now();
      if (Math.abs(current - ticker.now) >= intervalMs) ticker.now = current;
      return ticker.now;
    },
  };
  tickers.set(intervalMs, ticker);
  return ticker;
}

/** Subscribes to the shared clock ticking every `intervalMs`; returns the unsubscribe. */
export function subscribeTicker(intervalMs: number, listener: () => void): () => void {
  return tickerFor(intervalMs).subscribe(listener);
}

/** The shared clock's current reading for `intervalMs`. */
export function readTicker(intervalMs: number): number {
  return tickerFor(intervalMs).getSnapshot();
}

/** `Date.now()`, re-rendering every `intervalMs` off one interval shared by every caller at that cadence. */
export function useTicker(intervalMs: number): number {
  const ticker = tickerFor(intervalMs);
  return useSyncExternalStore(ticker.subscribe, ticker.getSnapshot);
}
