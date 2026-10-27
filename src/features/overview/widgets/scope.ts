/**
 * Which Characters a widget reads, and what it must say about it.
 *
 * A widget reads All characters only when its own scope says so (its menu's
 * Header Character / All characters choice). Only some kinds can sum across
 * Characters (the account-wide ones, and Open orders, whose read already fans
 * out); every other kind falls back to the active Character and says so on
 * the widget, so a pilot never reads one Character's figure as the account's.
 */
import { feedsOf, kindSumsAcrossCharacters } from './data/models';
import type { ViewSettings } from './data/viewSettings';
import type { WidgetScope } from './layout';

export interface ScopePresentation {
  /** The read covers every Character (handed to the kind's adapter). */
  scopeAll: boolean;
  /** Draw the "All characters" chip in the widget header. */
  chip: boolean;
  /** Draw the "uses the header Character" note: All was asked for but cannot be done. */
  fallbackNote: boolean;
}

/** `settings` are the widget's own, for a kind whose scope follows one (Profit sums only on Trading). */
export function scopePresentation(
  kind: string,
  widgetScope: WidgetScope,
  settings?: ViewSettings
): ScopePresentation {
  if (widgetScope !== 'all') return { scopeAll: false, chip: false, fallbackNote: false };
  if (kindSumsAcrossCharacters(kind, settings))
    return { scopeAll: true, chip: true, fallbackNote: false };
  // A kind with no data yet has nothing to be a fallback of.
  return { scopeAll: false, chip: false, fallbackNote: feedsOf(kind) !== undefined };
}
