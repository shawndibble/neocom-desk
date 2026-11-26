import { createLocalSetting } from '@/lib/useLocalSetting';

export const ANALYTICS_ENABLED_KEY = 'analyticsEnabled';

export const useAnalyticsEnabled = createLocalSetting<boolean>({
  key: ANALYTICS_ENABLED_KEY,
  defaultValue: true,
});
