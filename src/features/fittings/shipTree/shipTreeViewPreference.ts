/**
 * Map | Ladder choice for the Ship Tree. Device-local and never in the URL,
 * like the Fittings editor's Ring | List (`fittingViewPreference.ts`): a view
 * preference, not something a link carries. `null` means "never chosen", so
 * the breakpoint decides — the map on a desktop, the ladder on a phone.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const SHIP_TREE_VIEW_SETTING_KEY = 'shipTreeView';

export type ShipTreeView = 'map' | 'ladder';

export const useShipTreeViewPreference = createLocalSetting<ShipTreeView | null>({
  key: SHIP_TREE_VIEW_SETTING_KEY,
  defaultValue: null,
  parse: (raw) => (raw === 'map' || raw === 'ladder' ? raw : null),
});

/** The view in effect: the stored choice, else the default for this breakpoint. */
export function resolveShipTreeView(stored: ShipTreeView | null, isPhone: boolean): ShipTreeView {
  return stored ?? (isPhone ? 'ladder' : 'map');
}

/** Ship Info › Skills & Mastery "Show missing": hide what's already trained. Device-local, sticks across hulls. */
export const useShipInfoShowMissing = createLocalSetting<boolean>({
  key: 'shipInfoShowMissing',
  defaultValue: false,
});
