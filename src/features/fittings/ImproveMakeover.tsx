import type { TFunction } from 'i18next';
import { formatSeconds } from '@/lib/duration';
import { useTranslation } from 'react-i18next';
import { Checkbox, IskAmount, TypeIcon } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { ImproveCandidate } from '@/engine/fittings/improve';
import { moveKey } from '@/engine/fittings/improve';
import type { Makeover } from '@/engine/fittings/improve';
import type { FittingStats } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { formatSignedPercent } from '@/lib/formatSignedPercent';
import { groupTick, groupToggleTarget, showsOwnGain } from './improveMakeoverTicks';
import { MakeItFitSection } from './MakeItFitSection';

export interface ImproveMakeoverProps {
  makeover: Makeover;
  before: FittingStats;
  ticked: ReadonlySet<string>;
  onToggle: (rowKeys: readonly string[], checked: boolean) => void;
  singleGains?: ReadonlyMap<string, number>;
  rounds?: number;
  typeName: (typeId: number) => string;
  rowCost: (row: ImproveCandidate) => number | null;
  hintOf?: (row: ImproveCandidate) => string | null;
  cautions?: readonly string[];
}

type Tone = 'up' | 'same' | 'tight' | 'over';
interface Figure {
  id: string;
  before: string;
  after: string;
  tone: Tone;
}

const toneClass: Record<Tone, string> = {
  up: 'text-success',
  same: 'text-text',
  tight: 'text-warning',
  over: 'text-danger',
};

const higher = (before: number, after: number): Tone =>
  after > before ? 'up' : after < before ? 'over' : 'same';
function capacitorTone(before: FittingStats, after: FittingStats): Tone {
  const was = before.capacitor;
  const now = after.capacitor;
  if (was.stable && now.stable) return higher(was.stablePercentage, now.stablePercentage);
  if (!was.stable && !now.stable) return higher(was.depletesInSeconds, now.depletesInSeconds);
  return now.stable ? 'up' : 'over';
}
const resourceTone = (used: number, total: number): Tone =>
  used > total ? 'over' : total > 0 && used / total >= 0.98 ? 'tight' : 'same';

function figuresOf(t: TFunction, before: FittingStats, after: FittingStats): Figure[] {
  const cap = (s: FittingStats) =>
    s.capacitor.stable
      ? t('fittings.improve.makeover.capStable', { pct: Math.round(s.capacitor.stablePercentage) })
      : t('fittings.improve.makeover.capEmptyIn', {
          time: formatSeconds(s.capacitor.depletesInSeconds),
        });
  const pair = (b: number, a: number) => ({ before: formatCount(b), after: formatCount(a) });
  return [
    {
      id: 'dps',
      ...pair(before.offense.dps, after.offense.dps),
      tone: higher(before.offense.dps, after.offense.dps),
    },
    { id: 'ehp', ...pair(before.ehp, after.ehp), tone: higher(before.ehp, after.ehp) },
    {
      id: 'speed',
      before: t('fittings.improve.makeover.speedValue', {
        value: formatCount(before.navigation.maxVelocity),
      }),
      after: t('fittings.improve.makeover.speedValue', {
        value: formatCount(after.navigation.maxVelocity),
      }),
      tone: higher(before.navigation.maxVelocity, after.navigation.maxVelocity),
    },
    {
      id: 'capacitor',
      before: cap(before),
      after: cap(after),
      tone: capacitorTone(before, after),
    },
    {
      id: 'cpu',
      before: `${formatCount(before.cpuUsed)}/${formatCount(before.cpuTotal)}`,
      after: `${formatCount(after.cpuUsed)}/${formatCount(after.cpuTotal)}`,
      tone: resourceTone(after.cpuUsed, after.cpuTotal),
    },
    {
      id: 'powergrid',
      before: `${formatCount(before.powergridUsed)}/${formatCount(before.powergridTotal)}`,
      after: `${formatCount(after.powergridUsed)}/${formatCount(after.powergridTotal)}`,
      tone: resourceTone(after.powergridUsed, after.powergridTotal),
    },
  ];
}

interface SourceGroup {
  fromTypeId: number | null;
  copies: number;
  rows: ImproveCandidate[];
}

function groupBySource(rows: readonly ImproveCandidate[]): SourceGroup[] {
  const groups = new Map<number | null, SourceGroup>();
  for (const row of rows) {
    const group = groups.get(row.fromTypeId) ?? { fromTypeId: row.fromTypeId, copies: 0, rows: [] };
    group.copies += row.at.length;
    group.rows.push(row);
    groups.set(row.fromTypeId, group);
  }
  return [...groups.values()];
}

export function ImproveMakeover({
  makeover,
  before,
  ticked,
  onToggle,
  singleGains,
  rounds,
  typeName,
  rowCost,
  hintOf,
  cautions = [],
}: ImproveMakeoverProps) {
  const { t } = useTranslation();
  const keys = makeover.rows.map((row) => moveKey(row));
  const state = groupTick(keys, ticked);
  const tickedCount = keys.filter((key) => ticked.has(key)).length;
  const figures = figuresOf(t, before, makeover.after);

  return (
    <MakeItFitSection heading={t('fittings.improve.makeover.heading')}>
      <div className="border-line space-y-3 rounded-xs border p-2">
        <label
          className={cx('flex cursor-pointer items-start gap-2 text-sm', tappableRowClassName)}
        >
          <Checkbox
            className="mt-0.5"
            checked={state === 'all'}
            ref={(element) => {
              if (element) element.indeterminate = state === 'some';
            }}
            onChange={() => onToggle(keys, groupToggleTarget(state))}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">
                {state === 'some'
                  ? t('fittings.improve.makeover.partTicked', {
                      ticked: tickedCount,
                      count: keys.length,
                    })
                  : t('fittings.improve.makeover.whole', { count: keys.length })}
              </span>
              <span className="text-success shrink-0 text-xs font-medium">
                {formatSignedPercent(makeover.score * 100)}
              </span>
            </span>
            <span className="text-text-dim block text-xs">
              {rounds !== undefined &&
                `${t('fittings.improve.makeover.rounds', { count: rounds })} `}
              {t('fittings.improve.makeover.wholeFit')}
            </span>
          </span>
        </label>
        {cautions.length > 0 && (
          <ul className="text-text-dim space-y-0.5 text-xs">
            {cautions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {figures.map((figure) => (
            <div key={figure.id} className="min-w-0">
              <dt className="text-text-dim text-xs">
                {t(`fittings.improve.makeover.figure.${figure.id}`)}
              </dt>
              <dd className="tabular-nums">
                <span className="text-text-dim">{figure.before}</span> →{' '}
                <span className={cx('font-medium', toneClass[figure.tone])}>{figure.after}</span>
              </dd>
            </div>
          ))}
        </dl>
        <ul className="space-y-2">
          {groupBySource(makeover.rows).map((source) => (
            <li key={source.fromTypeId ?? 'empty'}>
              <p className="text-text-dim flex items-center gap-2 text-xs">
                {source.fromTypeId !== null && (
                  <TypeIcon typeId={source.fromTypeId} size={32} width={16} height={16} />
                )}
                <span>
                  {source.fromTypeId === null
                    ? t('fittings.improve.makeover.fills')
                    : t(
                        source.rows.length > 1
                          ? 'fittings.improve.makeover.splitInto'
                          : 'fittings.improve.makeover.become',
                        { count: source.copies, name: typeName(source.fromTypeId) }
                      )}
                </span>
              </p>
              {source.rows.some((row) => row.losesRoll) && (
                <p className="text-warning text-xs">{t('fittings.improve.rollLost')}</p>
              )}
              <ul className="border-line ml-2 mt-1 space-y-1 border-l pl-2">
                {source.rows.map((row) => {
                  const key = moveKey(row);
                  const gain = singleGains?.get(key);
                  const cost = rowCost(row);
                  const hint = hintOf?.(row) ?? null;
                  return (
                    <li key={key}>
                      <label
                        className={cx(
                          'flex cursor-pointer items-start gap-2 text-sm',
                          tappableRowClassName
                        )}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={ticked.has(key)}
                          onChange={(event) => onToggle([key], event.target.checked)}
                        />
                        <TypeIcon typeId={row.toTypeId} size={32} width={24} height={24} />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">
                            {t('fittings.improve.makeover.rowName', {
                              count: row.at.length,
                              name: typeName(row.toTypeId),
                            })}
                          </span>
                          {showsOwnGain(state) && gain !== undefined && (
                            <span className="text-text-dim block text-xs">
                              {t('fittings.improve.makeover.onItsOwn', {
                                gain: formatSignedPercent(gain * 100),
                              })}
                            </span>
                          )}
                          {row.addsPropulsionFor && (
                            <span className="text-text-dim block text-xs">
                              {t('fittings.improve.makeover.addsPropulsion', {
                                job: t(`fittings.improve.job.${row.addsPropulsionFor}`),
                              })}
                            </span>
                          )}
                          {hint && <span className="text-text-dim block text-xs">{hint}</span>}
                          {cost !== null && (
                            <span className="block text-xs">
                              {cost < 0 ? (
                                <>
                                  {t('fittings.makeItFit.saves')} <IskAmount value={-cost} />
                                </>
                              ) : (
                                <>
                                  {t('fittings.improve.makeover.costs')} <IskAmount value={cost} />
                                </>
                              )}
                              {row.fromTypeId !== null && row.at[0]?.slot === 'rig' && (
                                <span className="text-text-dim">
                                  {' '}
                                  {t('fittings.improve.makeover.rigFullPrice')}
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </MakeItFitSection>
  );
}
