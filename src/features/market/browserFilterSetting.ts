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
