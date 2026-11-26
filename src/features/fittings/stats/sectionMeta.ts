import type { FittingStats } from '@/engine/fittings/types';
import { kmValue } from '../rangeText';
import { fmt1 } from './fixedFormat';
import type { Translate } from '@/lib/translate';

export function supportMeta(s: FittingStats, t: Translate): string {
  const { remoteRepair, rows } = s.support;
  const repair = remoteRepair.shield + remoteRepair.armor + remoteRepair.hull;
  if (repair > 0) return t('fittings.stats.unit.hpPerSecond', { value: fmt1(repair) });
  return t('fittings.stats.support.modules', {
    count: rows.reduce((sum, row) => sum + row.count, 0),
  });
}

export function fleetBoostsMeta(s: FittingStats, t: Translate): string {
  const { bursts, compressors } = s.fleetSupport;
  const meters = bursts[0]?.rangeMeters ?? compressors[0]?.rangeMeters ?? 0;
  return t('fittings.stats.unit.km', { value: kmValue(meters) });
}
