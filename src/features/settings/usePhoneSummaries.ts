import { useTranslation } from 'react-i18next';
import type { SettingsSectionId } from '@/features/settings/sections';
import { FONT_SCALE_LABEL_KEYS } from '@/features/settings/fontScaleLabelKeys';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useDefaultRoutePreference } from '@/features/route/routeRules';
import { ROUTE_PREFERENCE_LABEL_KEYS } from '@/features/route/routePreferences';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import { useFontScale } from '@/lib/fontScale';
import { useTimeFormat } from '@/lib/timeFormat';
import { TRADE_HUBS } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import { useAssumedMe } from '@/features/industry/assumedMe';
import { useAssumedTe } from '@/features/industry/assumedTe';
import { useDarkThreshold } from '@/features/corp/darkThreshold';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';

/**
 * One line per section for the phone list, from settings already in memory —
 * no network. A section with nothing cheap to say (Permissions, Alerts, Data
 * & storage, Activity Log, FAQ) gets none.
 */
export function usePhoneSummaries(): Partial<Record<SettingsSectionId, string>> {
  const { t } = useTranslation();
  const scale = useFontScale((state) => state.value);
  const timeFormat = useTimeFormat((state) => state.value);
  const assumedMe = useAssumedMe((state) => state.value);
  const assumedTe = useAssumedTe((state) => state.value);
  const hub = useMarketHub((state) => state.value);
  const characterFilter = useDefaultCharacterFilter((state) => state.value);
  const darkAfterDays = useDarkThreshold((state) => state.value);
  const avoidedCount = useAvoidedSystems((state) => state.value.length);
  // Only the Travel panel hydrates this otherwise, and the phone list does not mount it.
  useHydratedStore(useAvoidedSystems);
  const routePreference = useDefaultRoutePreference((state) => state.value);
  useHydratedStore(useDefaultRoutePreference);

  return {
    display: t('settings.summary.display', {
      size: t(FONT_SCALE_LABEL_KEYS[scale]),
      format: t(`settings.timeFormat.${timeFormat}`),
    }),
    industry: t('settings.summary.industry', {
      me: assumedMe,
      te: assumedTe,
    }),
    market: TRADE_HUBS.find((tradeHub) => tradeHub.id === hub)?.name,
    characters:
      characterFilter === 'current'
        ? t('settings.summary.charactersCurrent')
        : characterFilter === 'all'
          ? t('settings.summary.charactersAll')
          : t('settings.summary.charactersSome', { count: characterFilter.length }),
    corporation: t('settings.summary.corporation', { count: darkAfterDays }),
    travel: t('settings.summary.travel', {
      preference: t(ROUTE_PREFERENCE_LABEL_KEYS[routePreference]),
      count: avoidedCount,
    }),
  };
}
