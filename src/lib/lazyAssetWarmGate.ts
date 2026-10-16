/**
 * Whether the background warm of the lazy SDE files / dogma engine may run.
 * Pure: callers read `navigator` and pass the facts in.
 */

export interface WarmConditions {
  online: boolean;
  saveData?: boolean;
  /** `navigator.connection.effectiveType`. */
  effectiveType?: string;
  /** `navigator.connection.type` (only where exposed). */
  type?: string;
}

/** none: skip; small: SDE JSON (~28 MB raw, ~3.4 MB gzip summed per file); all: plus the ~10 MB dogma engine. */
export type WarmLevel = 'none' | 'small' | 'all';

const SLOW = new Set(['slow-2g', '2g', '3g']);

export function lazyAssetWarmLevel(c: WarmConditions): WarmLevel {
  if (!c.online || c.saveData) return 'none';
  if (c.effectiveType && SLOW.has(c.effectiveType)) return 'none';
  return c.type === 'cellular' ? 'small' : 'all';
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
}

/** Reads the live browser state; missing Network Information API means unknown, not blocked. */
export function currentWarmLevel(nav: Navigator = navigator): WarmLevel {
  const conn = (nav as Navigator & { connection?: NetworkInformationLike }).connection;
  return lazyAssetWarmLevel({
    online: nav.onLine,
    saveData: conn?.saveData,
    effectiveType: conn?.effectiveType,
    type: conn?.type,
  });
}
