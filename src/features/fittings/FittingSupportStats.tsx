import { useTranslation } from 'react-i18next';
import type { SupportRow } from '@/engine/fittings/support';
import type { FittingStats } from '@/engine/fittings/types';
import { rangeLines } from './rangeText';
import { HeatFigure, StatRow, StatRows } from './StatFacts';
import { joinDetail } from './statKit';
import { fixed2, fixedFormat } from '@/lib/fixedFormat';

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

function signed(amount: number, digits: number): string {
  const text = fixedFormat(digits)(Math.abs(amount));
  if (Number(text) === 0) return text;
  return amount < 0 ? `−${text}` : `+${text}`;
}

function effectsText(
  row: SupportRow,
  t: (key: string, options: Record<string, unknown>) => string
): string | null {
  const distinct = new Set(row.effects.map((e) => e.amount.toFixed(4)));
  if (row.effects.length === 0 || (row.kind === 'ecm' && distinct.size === 1)) return null;
  return row.effects
    .map((e) =>
      t(`fittings.stats.support.effect.${e.effect}`, {
        value: row.kind === 'ecm' ? fixed2(e.amount) : signed(e.amount, 0),
      })
    )
    .join(', ');
}

export function SupportFacts({
  stats,
  typeName,
}: {
  stats: FittingStats;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const range = (row: SupportRow) => rangeLines(t, row.optimal, row.falloff);
  const amount = (row: SupportRow) =>
    effectsText(row, t) ??
    t(`fittings.stats.support.kind.${row.kind}`, {
      value: fixedFormat(DIGITS[row.kind])(row.amount),
      count: row.amount,
    });
  const effectNames = (row: SupportRow) => row.effects.map((e) => e.effect).join(',');
  return (
    <StatRows>
      {stats.support.rows.map((row, index) => {
        const same = (s: FittingStats) =>
          s.support.rows.find(
            (other) =>
              other.kind === row.kind &&
              other.typeId === row.typeId &&
              effectNames(other) === effectNames(row)
          ) ?? row;
        return (
          <StatRow
            key={`${row.kind}:${row.typeId}:${index}`}
            name={t('fittings.stats.weaponRow', { count: row.count, name: typeName(row.typeId) })}
            detail={joinDetail(
              range(row).map((_, line) => (
                <HeatFigure key={line} stats={stats} format={(s) => range(same(s))[line] ?? ''} />
              ))
            )}
            figure={<HeatFigure stats={stats} format={(s) => amount(same(s))} />}
          />
        );
      })}
    </StatRows>
  );
}
