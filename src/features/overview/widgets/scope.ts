/**
 * Which Characters a widget reads, and what it must say about it.
 *
 * A widget reads All characters only when its own scope says so (its menu's
 * Header Character / All characters choice). Only some kinds can sum across
 * Characters (the account-wide ones, and Open orders, whose read already fans
 * out); every other kind falls back to the active Character and says so on
 * the widget, so a pilot never reads one Character's figure as the account's.
 * On the Corp Board a scope can also name one corporation (`corp:<id>`).
 */
import { feedsOf, kindSumsAcrossCharacters } from './data/models';
import type { ViewSettings } from './data/viewSettings';
import { scopeCorporation, type WidgetScope } from './layout';

export interface ScopePresentation {
  /** The read covers every Character (handed to the kind's adapter). */
  scopeAll: boolean;
  /** Draw the "All characters" chip in the widget header. */
  chip: boolean;
  /** Draw the "uses the header Character" note: All was asked for but cannot be done. */
  fallbackNote: boolean;
  /** The read narrows to this one corporation (a corporation scope on a kind that can sum). */
  corporationId?: number;
  /**
   * Corp Board only: the kind reads exactly one corporation, through the header Character, and
   * the scope asks for several (All) or for `wantedCorporationId`. The widget asks which
   * corporation, unless that one is the header Character's own.
   */
  needsOneCorporation?: boolean;
  wantedCorporationId?: number;
}

/** `settings` are the widget's own, for a kind whose scope follows one (Profit sums only on Trading). */
export function scopePresentation(
  kind: string,
  widgetScope: WidgetScope,
  settings?: ViewSettings,
  corpBoard = false
): ScopePresentation {
  if (widgetScope === 'header') return { scopeAll: false, chip: false, fallbackNote: false };
  const corporationId = scopeCorporation(widgetScope);
  const sums = kindSumsAcrossCharacters(kind, settings);
  if (corporationId !== null) {
    return sums
      ? { scopeAll: true, chip: true, fallbackNote: false, corporationId }
      : {
          scopeAll: false,
          chip: false,
          fallbackNote: false,
          needsOneCorporation: true,
          wantedCorporationId: corporationId,
        };
  }
  if (sums) return { scopeAll: true, chip: true, fallbackNote: false };
  // A corporation's data has one owner: the Corp Board asks which, rather than quietly reading one.
  if (corpBoard && feedsOf(kind) !== undefined) {
    return { scopeAll: false, chip: false, fallbackNote: false, needsOneCorporation: true };
  }
  // A kind with no data yet has nothing to be a fallback of.
  return { scopeAll: false, chip: false, fallbackNote: feedsOf(kind) !== undefined };
}
