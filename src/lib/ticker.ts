import { useSyncExternalStore } from 'react';

interface Ticker {
  intervalMs: number;
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
}

const JOIN_FRESHNESS_MS = 1_000;

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
      if (ticker.listeners.size === 0 && subscribedTickers++ === 0) {
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisibilityChange);
        }
      }
      ticker.listeners.add(listener);
      const current = Date.now();
      if (Math.abs(current - ticker.now) >= JOIN_FRESHNESS_MS) publish(ticker, current);
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
      const current = Date.now();
      if (Math.abs(current - ticker.now) >= intervalMs) ticker.now = current;
      return ticker.now;
    },
  };
  tickers.set(intervalMs, ticker);
  return ticker;
}

export function useTicker(intervalMs: number): number {
  const ticker = tickerFor(intervalMs);
  return useSyncExternalStore(ticker.subscribe, ticker.getSnapshot);
}
