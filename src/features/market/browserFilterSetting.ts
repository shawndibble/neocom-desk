/**
 * The Order Book filter bar's (Jump Range/Security/Min quantity/NPC stations
 * only/Hide bait sells) device-local remembered default — the URL states the live values
 * (ADR 0015, `useOrderBookOrchestration.ts`'s `BROWSER_FILTER_PARAMS`); this
 * is the persisted fallback behind it, like `locationMode.ts`'s Location Mode,
 * so a filter set once survives a reload or a fresh visit with no matching
 * query string, and "use game location" keeps tracking the active
 * character's ESI location dynamically via `currentSystem.ts` rather than a
 * frozen snapshot.
 */
import { JUMP_RANGES, DEFAULT_JUMP_RANGE, type JumpRange } from '@/engine/route/jumpRange';
import { SPACE_KINDS, isSpaceKind, type SpaceKind } from '@/engine/space';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const BROWSER_FILTER_SETTING_KEY = 'marketBrowserFilters';

export interface BrowserFilterSettingValue {
  jumps: JumpRange;
  sec: ReadonlySet<SpaceKind>;
  minQty: number;
  npcOnly: boolean;
  hideBait: boolean;
}

export const DEFAULT_BROWSER_FILTER_SETTING: BrowserFilterSettingValue = {
  jumps: DEFAULT_JUMP_RANGE,
  sec: new Set(SPACE_KINDS),
  minQty: 0,
  npcOnly: false,
  hideBait: false,
};

/** `hideBait` came later, so a value stored before it reads as off rather than resetting every filter. */
function isBrowserFilterSettingValue(
  raw: unknown
): raw is Omit<BrowserFilterSettingValue, 'hideBait'> & { hideBait?: boolean } {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.jumps === 'string' &&
    (JUMP_RANGES as readonly string[]).includes(r.jumps) &&
    r.sec instanceof Set &&
    [...r.sec].every(isSpaceKind) &&
    typeof r.minQty === 'number' &&
    Number.isInteger(r.minQty) &&
    r.minQty >= 0 &&
    typeof r.npcOnly === 'boolean' &&
    (r.hideBait === undefined || typeof r.hideBait === 'boolean')
  );
}

export const useBrowserFilterSetting = createLocalSetting<BrowserFilterSettingValue>({
  key: BROWSER_FILTER_SETTING_KEY,
  defaultValue: DEFAULT_BROWSER_FILTER_SETTING,
  parse: (raw) =>
    isBrowserFilterSettingValue(raw) ? { ...raw, hideBait: raw.hideBait ?? false } : null,
});
