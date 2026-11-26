export interface WarmConditions {
  online: boolean;
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
}

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

export function currentWarmLevel(nav: Navigator = navigator): WarmLevel {
  const conn = (nav as Navigator & { connection?: NetworkInformationLike }).connection;
  return lazyAssetWarmLevel({
    online: nav.onLine,
    saveData: conn?.saveData,
    effectiveType: conn?.effectiveType,
    type: conn?.type,
  });
}
