import { useTranslation } from 'react-i18next';
import { holdFillSeconds } from '@/engine/fittings/mining';
import type { FittingStats } from '@/engine/fittings/types';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatDuration } from '@/lib/duration';
import { Facts } from './StatFacts';

/**
 * Mining: each miner type (with its crystal) and mining drone stack, what
 * they mine a cycle and a second, the total an hour, the residue expected on
 * top, and how soon the ore hold — or the cargo hold, on a hull without one —
 * fills.
 */
export function MiningFacts({
  stats,
  typeName,
}: {
  stats: FittingStats;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const { mining, holds } = stats;
  const hold = holds.miningHold > 0 ? holds.miningHold : holds.cargo;
  const holdLabel = t(
    holds.miningHold > 0 ? 'fittings.stats.fact.miningHold' : 'fittings.stats.fact.cargo'
  );
  const fill = holdFillSeconds(hold, mining.perSecond);
  const perSecond = (value: number) =>
    t('fittings.stats.unit.cubicMetresPerSecond', { value: value.toFixed(1) });

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5 text-xs">
        {mining.rows.map((row) => (
          <li
            key={`${row.isDrone ? 'drone' : 'module'}:${row.typeId}:${row.chargeTypeId ?? ''}`}
            className="flex flex-wrap justify-between gap-x-2"
          >
            <span className="min-w-0">
              {t('fittings.stats.weaponRow', { count: row.count, name: typeName(row.typeId) })}
              {row.chargeTypeId !== undefined && (
                <span className="block text-text-dim">
                  {t('fittings.stats.mining.crystal', { name: typeName(row.chargeTypeId) })}
                </span>
              )}
              <span className="block text-text-dim tabular-nums">
                {t('fittings.stats.mining.perCycle', {
                  value: row.perCycle.toFixed(0),
                  seconds: row.cycleSeconds.toFixed(1),
                })}
              </span>
            </span>
            <span className="shrink-0 text-right tabular-nums">{perSecond(row.perSecond)}</span>
          </li>
        ))}
      </ul>
      <Facts
        items={[
          { label: t('fittings.stats.mining.total'), value: perSecond(mining.perSecond) },
          {
            label: t('fittings.stats.mining.perHour'),
            value: t('fittings.stats.unit.cubicMetresPerHour', {
              value: formatCompactNumber(mining.perHour),
            }),
          },
          {
            label: t('fittings.stats.mining.residue'),
            value: t('fittings.stats.mining.residueValue', {
              pct: mining.wastePct.toFixed(1),
              value: mining.wastePerSecond.toFixed(1),
            }),
          },
          ...(fill !== null
            ? [
                {
                  label: t('fittings.stats.mining.fillsIn', { hold: holdLabel }),
                  value: t('fittings.stats.mining.fillTime', {
                    time: formatDuration(fill),
                    capacity: hold.toFixed(0),
                  }),
                },
              ]
            : []),
        ]}
      />
      <p className="text-xs text-text-dim">{t('fittings.stats.mining.note')}</p>
    </div>
  );
}
