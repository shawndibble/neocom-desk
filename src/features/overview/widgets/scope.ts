/**
 * Which Characters a widget reads, and what it must say about it.
 *
 * A widget reads All characters when its own scope says so or the header
 * switcher is on All. Only some kinds can sum across Characters (the
 * account-wide ones, and Open orders, whose read already fans out); every
 * other kind falls back to the header Character and says so on the widget,
 * so a pilot never reads one Character's figure as the account's.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { KIND_FEEDS, kindSumsAcrossCharacters } from './data/models';
import type { WidgetScope } from './layout';

export interface ScopePresentation {
  /** The read covers every Character (handed to the kind's adapter). */
  scopeAll: boolean;
  /** Draw the "All characters" chip in the widget header. */
  chip: boolean;
  /** Draw the "uses the header Character" note: All was asked for but cannot be done. */
  fallbackNote: boolean;
}

export function scopePresentation(
  kind: string,
  widgetScope: WidgetScope,
  headerAll: boolean
): ScopePresentation {
  const wantsAll = widgetScope === 'all' || headerAll;
  if (!wantsAll) return { scopeAll: false, chip: false, fallbackNote: false };
  if (kindSumsAcrossCharacters(kind)) return { scopeAll: true, chip: true, fallbackNote: false };
  // A kind with no data yet has nothing to be a fallback of.
  return { scopeAll: false, chip: false, fallbackNote: KIND_FEEDS[kind] !== undefined };
}

/**
 * The header switcher's "All characters": a per-Overview, per-device choice.
 * Choosing a Character in the switcher turns it off and makes that Character
 * the active one; it is not a synced setting, because which Characters a
 * given device is looking at is the device's own business.
 */
export const OVERVIEW_SCOPE_ALL_KEY = 'overviewScopeAll';

export const useOverviewScopeAll = createLocalSetting<boolean>({
  key: OVERVIEW_SCOPE_ALL_KEY,
  defaultValue: false,
});
