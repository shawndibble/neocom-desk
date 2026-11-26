import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_COLONIES_SHOW_ALTS_KEY = 'piColoniesShowAlts';

export const DEFAULT_PI_COLONIES_SHOW_ALTS = false;

export const useShowAltColonies = createLocalSetting<boolean>({
  key: PI_COLONIES_SHOW_ALTS_KEY,
  defaultValue: DEFAULT_PI_COLONIES_SHOW_ALTS,
});
