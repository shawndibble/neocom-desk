import { createLocalSetting } from '@/lib/useLocalSetting';

export const SHIP_TREE_VIEW_SETTING_KEY = 'shipTreeView';

export type ShipTreeView = 'map' | 'ladder';

export const useShipTreeViewPreference = createLocalSetting<ShipTreeView | null>({
  key: SHIP_TREE_VIEW_SETTING_KEY,
  defaultValue: null,
  parse: (raw) => (raw === 'map' || raw === 'ladder' ? raw : null),
});

export function resolveShipTreeView(stored: ShipTreeView | null, isPhone: boolean): ShipTreeView {
  return stored ?? (isPhone ? 'ladder' : 'map');
}

export const useShipInfoShowMissing = createLocalSetting<boolean>({
  key: 'shipInfoShowMissing',
  defaultValue: false,
});
