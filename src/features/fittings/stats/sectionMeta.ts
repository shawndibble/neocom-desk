import type { FittingStats } from '@/engine/fittings/types';
import { kmValue } from '../rangeText';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Support out's headline: remote repair handed out, else how many modules reach another ship. */
export function supportMeta(s: FittingStats, t: Translate): string {
  const { remoteRepair, rows } = s.support;
  const repair = remoteRepair.shield + remoteRepair.armor + remoteRepair.hull;
  if (repair > 0) return t('fittings.stats.unit.hpPerSecond', { value: repair.toFixed(1) });
  return t('fittings.stats.support.modules', {
    count: rows.reduce((sum, row) => sum + row.count, 0),
  });
}

/** Fleet boosts' headline: how far the first burst reaches, else the compressor. */
export function fleetBoostsMeta(s: FittingStats, t: Translate): string {
  const { bursts, compressors } = s.fleetSupport;
  const meters = bursts[0]?.rangeMeters ?? compressors[0]?.rangeMeters ?? 0;
  return t('fittings.stats.unit.km', { value: kmValue(meters) });
}
