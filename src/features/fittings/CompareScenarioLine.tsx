import { useTranslation } from 'react-i18next';
import { AbyssalWeatherPicker } from './AbyssalWeatherPicker';
import { DamageProfilePicker } from './DamageProfilePicker';
import type { DamageProfiles } from './damageProfiles';
import { TargetProfilePicker } from './TargetProfilePicker';
import type { TargetProfiles } from './targetProfiles';

export function CompareScenarioLine({
  damageProfiles,
  targetProfiles,
}: {
  damageProfiles: DamageProfiles;
  targetProfiles: TargetProfiles;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="compare-controls"
      className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-text-dim"
    >
      <span>{t('fittings.compare.scenario.against')}</span>
      <TargetProfilePicker targetProfiles={targetProfiles} />
      <span>{t('fittings.compare.scenario.taking')}</span>
      <DamageProfilePicker damageProfiles={damageProfiles} />
      <span>{t('fittings.compare.scenario.in')}</span>
      <AbyssalWeatherPicker />
    </div>
  );
}
