import { resistPct, unheatedIfChanged } from '@/engine/fittings/stats';
import type { FittingStats } from '@/engine/fittings/types';
import type { ResistRow } from './ResistTable';
import { RESIST_TYPES, RESONANCE_KEY, formatEhp } from './resistFormat';
import { fmt0 } from './fixedFormat';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The Defense table's rows: shield, armor, hull, then one row per RAH with its adapted resists. */
export function resistRows(
  s: FittingStats,
  adaptedHardeners: readonly ResistRow['resonances'][],
  profileName: string,
  t: Translate
): ResistRow[] {
  const layers = [
    { key: 'shield' as const, label: t('fittings.stats.shield'), layer: s.shield },
    { key: 'armor' as const, label: t('fittings.stats.armor'), layer: s.armor },
    { key: 'hull' as const, label: t('fittings.stats.hull'), layer: s.hull },
  ];
  const rows: ResistRow[] = [];
  for (const { key, label, layer } of layers) {
    // "Overheat all": the cells heat changed, with what they read unheated.
    const unheated: NonNullable<ResistRow['unheated']> = {};
    for (const type of RESIST_TYPES) {
      const was = unheatedIfChanged(s, (x) => fmt0(resistPct(x[key][RESONANCE_KEY[type]])));
      if (was !== null) unheated[type] = `${was}%`;
    }
    const wasEhp = unheatedIfChanged(s, (x) => formatEhp(x[key].ehp));
    if (wasEhp !== null) unheated.ehp = wasEhp;
    rows.push({
      key,
      label,
      sub: t('fittings.stats.layerHp', { hp: fmt0(layer.hp) }),
      resonances: layer,
      ehp: layer.ehp,
      unheated,
    });
  }
  adaptedHardeners.forEach((resonances, index) =>
    rows.push({
      key: `rah-${index}`,
      label: t('fittings.stats.rahRow'),
      sub: profileName,
      resonances,
      tone: 'note',
    })
  );
  return rows;
}
