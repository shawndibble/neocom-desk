import { feedsOf, kindSumsAcrossCharacters } from './data/models';
import type { ViewSettings } from './data/viewSettings';
import { scopeCorporation, type WidgetScope } from './layout';

export interface ScopePresentation {
  scopeAll: boolean;
  chip: boolean;
  fallbackNote: boolean;
  corporationId?: number;
  needsOneCorporation?: boolean;
  wantedCorporationId?: number;
}

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
  if (corpBoard && feedsOf(kind) !== undefined) {
    return { scopeAll: false, chip: false, fallbackNote: false, needsOneCorporation: true };
  }
  return { scopeAll: false, chip: false, fallbackNote: feedsOf(kind) !== undefined };
}
