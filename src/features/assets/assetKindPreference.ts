/**
 * The Items page's Asset Category and Blueprints picks, remembered per device
 * (issue #5601). Device-local view preference, never synced. Stored as the
 * URL's own strings (`cat` absent = All, `''` = None), so one codec reads both.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { BLUEPRINT_KINDS, type BlueprintKind } from './assetCategoryFilter';

export const ASSET_KIND_SETTING_KEY = 'assetsKindFilter';

export interface AssetKindPreference {
  /** The `cat` URL string; null is All. */
  cat: string | null;
  bp: BlueprintKind;
}

export const DEFAULT_ASSET_KIND: AssetKindPreference = { cat: null, bp: 'any' };

export const useAssetKindPreference = createLocalSetting<AssetKindPreference>({
  key: ASSET_KIND_SETTING_KEY,
  defaultValue: DEFAULT_ASSET_KIND,
  parse: (raw) => {
    if (typeof raw !== 'object' || raw === null) return null;
    const { cat, bp } = raw as Record<string, unknown>;
    return {
      cat: typeof cat === 'string' ? cat : null,
      bp: BLUEPRINT_KINDS.includes(bp as BlueprintKind) ? (bp as BlueprintKind) : 'any',
    };
  },
});
