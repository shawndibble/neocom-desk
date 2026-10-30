import { useTranslation } from 'react-i18next';
import type { FittingStats } from '@/engine/fittings/types';
import { Facts } from './StatFacts';
import { fixed0, fixed1 } from '@/lib/fixedFormat';

/**
 * Exploration: what the fit hacks (data and relic strength, coherence, utility
 * slots), how strong its probes are, the scan arrays' cuts, and how soon a
 * cloak lets it lock again. A figure the fit has none of is left out.
 */
export function ExploreFacts({ stats }: { stats: FittingStats }) {
  const { t } = useTranslation();
  const { explore } = stats;
  const { hacking, probe, scanning } = explore;
  const label = (key: string) => t(`fittings.stats.exploration.${key}`);
  const seconds = (value: number) => t('fittings.stats.unit.seconds', { value: fixed1(value) });
  const percent = (value: number) => t('fittings.stats.unit.percent', { value: fixed0(value) });
  const fact = (key: string, value: number, format: (n: number) => string) =>
    value !== 0 ? [{ label: label(key), value: format(value) }] : [];
  const hasLauncher = probe.cycleSeconds > 0;

  return (
    <Facts
      items={[
        ...fact('dataStrength', explore.dataStrength, fixed0),
        ...fact('relicStrength', explore.relicStrength, fixed0),
        ...fact('coherence', hacking.coherence, fixed0),
        ...fact('utilitySlots', explore.utilitySlots, fixed0),
        ...fact('analyzerCycle', hacking.cycleSeconds, seconds),
        // An empty launcher has no probe to measure; it still has its own bonus.
        ...(hasLauncher
          ? [
              {
                label: label('probeStrength'),
                value: probe.strength > 0 ? fixed1(probe.strength) : label('noProbe'),
              },
            ]
          : []),
        ...fact('launcherBonus', probe.launcherBonus, percent),
        ...fact('launchCycle', probe.cycleSeconds, seconds),
        ...fact('scanStrength', scanning.strength, percent),
        ...fact('scanTimeCut', scanning.duration, percent),
        ...fact('deviationCut', scanning.deviation, percent),
        ...fact('cloakRelock', explore.cloakRecalibrationSeconds, seconds),
      ]}
    />
  );
}
