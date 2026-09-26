import { useTranslation } from 'react-i18next';
import type { SupportRow, SupportStats } from '@/engine/fittings/support';

/** Rates and points to one decimal; percentages and jam strength as the game shows them. */
const DIGITS: Record<SupportRow['kind'], number> = {
  remoteShield: 1,
  remoteArmor: 1,
  remoteHull: 1,
  neutralizer: 1,
  nosferatu: 1,
  capTransfer: 1,
  web: 0,
  warpDisruption: 0,
  ecm: 2,
  targetPainter: 0,
  trackingDisruptor: 0,
  sensorDampener: 0,
  guidanceDisruptor: 0,
};

/** A signed % reads −17 / +12, the way the kind labels already spell them. */
function signed(amount: number, digits: number): string {
  const text = Math.abs(amount).toFixed(digits);
  return amount < 0 ? `−${text}` : `+${text}`;
}

/**
 * Every effect of a disruptor or dampener, or each differing jam strength of
 * an ECM; null where the kind label alone says it (one effect, or a
 * multispectral jammer's single strength).
 */
function effectsText(
  row: SupportRow,
  t: (key: string, options: Record<string, unknown>) => string
): string | null {
  const distinct = new Set(row.effects.map((e) => e.amount.toFixed(4)));
  if (row.effects.length === 0 || (row.kind === 'ecm' && distinct.size === 1)) return null;
  return row.effects
    .map((e) =>
      t(`fittings.stats.support.effect.${e.effect}`, {
        value: row.kind === 'ecm' ? e.amount.toFixed(2) : signed(e.amount, 0),
      })
    )
    .join(', ');
}

/**
 * Support out: every running module that reaches another ship, one row a
 * module type — what it hands out or takes away, and at what range.
 */
export function SupportFacts({
  support,
  typeName,
}: {
  support: SupportStats;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1.5 text-xs">
      {support.rows.map((row, index) => (
        <li
          key={`${row.kind}:${row.typeId}:${index}`}
          className="flex flex-wrap justify-between gap-x-2"
        >
          <span className="min-w-0">
            {t('fittings.stats.weaponRow', { count: row.count, name: typeName(row.typeId) })}
            <span className="block text-text-dim tabular-nums">
              {row.falloff > 0
                ? t('fittings.stats.support.rangeFalloff', {
                    optimal: (row.optimal / 1000).toFixed(1),
                    falloff: (row.falloff / 1000).toFixed(1),
                  })
                : t('fittings.stats.support.range', { optimal: (row.optimal / 1000).toFixed(1) })}
            </span>
          </span>
          <span className="shrink-0 text-right tabular-nums">
            {effectsText(row, t) ??
              t(`fittings.stats.support.kind.${row.kind}`, {
                value: row.amount.toFixed(DIGITS[row.kind]),
                count: row.amount,
              })}
          </span>
        </li>
      ))}
    </ul>
  );
}
