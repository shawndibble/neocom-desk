/**
 * The Makeover group (#5548): a whole-fit rework laid out by the fitted module
 * that leaves ("2× Shield Power Relay II split into", then one tickable row per
 * new module). One tick for the group, three states; the whole-fit before →
 * after figures on top. Renders from props only: the search, names and prices
 * come from the owner.
 */
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Checkbox, IskAmount, TypeIcon } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { ImproveCandidate } from '@/engine/fittings/improve';
import { moveKey } from '@/engine/fittings/improveKeys';
import type { Makeover } from '@/engine/fittings/improveMakeover';
import type { FittingStats } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { formatSignedPercent } from '@/lib/formatSignedPercent';
import { groupTick, groupToggleTarget, showsOwnGain } from './improveMakeoverTicks';
import { MakeItFitSection } from './MakeItFitSection';

export interface ImproveMakeoverProps {
  makeover: Makeover;
  /** The open fit's figures, the "before" of the whole-fit line. */
  before: FittingStats;
  /** Keys (`moveKey` of a row's candidate) of the ticked rows. */
  ticked: ReadonlySet<string>;
  /** Ticks (`checked`) or unticks every key given; the group passes all its rows. */
  onToggle: (rowKeys: readonly string[], checked: boolean) => void;
  /** Each row's goal gain on its own, as a fraction, by row key; shown while the group is partly ticked. */
  singleGains?: ReadonlyMap<string, number>;
  /** Rounds the search took, for "Found in N rounds"; absent: the line is left out. */
  rounds?: number;
  typeName: (typeId: number) => string;
  /** ISK the row costs (a rig at full price); null: no price. */
  rowCost: (row: ImproveCandidate) => number | null;
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
const resourceTone = (used: number, total: number): Tone =>
  used > total ? 'over' : total > 0 && used / total >= 0.98 ? 'tight' : 'same';

/** The whole-fit figures: DPS, EHP, speed, capacitor, CPU, powergrid. */
function figuresOf(t: TFunction, before: FittingStats, after: FittingStats): Figure[] {
  const cap = (s: FittingStats) =>
    s.capacitor.stable
      ? t('fittings.improve.makeover.capStable')
      : t('fittings.improve.makeover.capUnstable');
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
      tone: after.capacitor.stable ? 'same' : 'over',
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
  /** The fitted module that leaves; null for rows that fill an empty slot. */
  fromTypeId: number | null;
  /** Copies of it that change, over all its rows. */
  copies: number;
  rows: ImproveCandidate[];
}

/** Rows under the fitted module they replace, in the Makeover's own order. */
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
              <ul className="border-line ml-2 mt-1 space-y-1 border-l pl-2">
                {source.rows.map((row) => {
                  const key = moveKey(row);
                  const gain = singleGains?.get(key);
                  const cost = rowCost(row);
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
