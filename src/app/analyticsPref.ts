/**
 * Device-local analytics switch (Settings → App & backup). Off means
 * `trackPageView` never loads Firebase Analytics at all. Imports only the
 * setting factory so `analytics.ts` stays free of a static `firebase/*` import
 * (`bootImportGraph.test.ts`). Never synced: consent is per device.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const ANALYTICS_ENABLED_KEY = 'analyticsEnabled';

export const useAnalyticsEnabled = createLocalSetting<boolean>({
  key: ANALYTICS_ENABLED_KEY,
  defaultValue: true,
});
