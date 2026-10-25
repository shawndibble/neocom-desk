import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { RowMoreActions } from '@/components/ui';
import { weaponRowKey } from '@/engine/fittings/stats';
import type {
  DamageFigures as DamageFiguresValue,
  Fitting,
  FittingItemState,
  FittingModule,
  FittingModuleResult,
  FittingStats,
  SpoolFigures,
  WeaponRow,
} from '@/engine/fittings/types';
import { HeatFigure, StatRowContent, StatRows } from '../StatFacts';
import { joinDetail, statRowClassName } from '../statKit';
import { FittingItemMenu, WeaponMenuItems } from '../FittingItemMenu';
import { rangeLines } from '../rangeText';
import { useFittingItemActions } from '../fittingItemActions';
import { fmt0, fmt1 } from './fixedFormat';

/**
 * A row's DPS and volley — under "Overheat all", in the warning tone where
 * heat changed them. `figures` picks the same row out of either calculation.
 * Sustained DPS (with reload), where reloading costs anything, is a dim
 * `line` under the figures (the total) or their `tooltip` (a weapon row).
 */
function DamageFigures({
  stats,
  figures,
  sustained = 'tooltip',
  previewed = false,
  spool,
}: {
  stats: FittingStats;
  figures: (stats: FittingStats) => DamageFiguresValue;
  sustained?: 'tooltip' | 'line';
  /** The fit's total: a previewed change to its DPS, volley or sustained DPS shows in place. */
  previewed?: boolean;
  /** A spool weapon's row: its DPS reads unspooled → spooled, its volley says it is unspooled. */
  spool?: SpoolFigures;
}) {
  const { t } = useTranslation();
  const sustainedLabel = (s: FittingStats) =>
    t('fittings.stats.sustainedDps', { value: fmt1(figures(s).sustainedDps) });
  // Only where reloading costs something as shown: never lasers or drones.
  const { dps, sustainedDps } = figures(stats);
  const reloads = fmt1(sustainedDps) !== fmt1(dps);
  const tooltip = sustained === 'tooltip' && reloads ? sustainedLabel(stats) : undefined;
  const numbers = (
    <span className="ml-auto shrink-0 text-right tabular-nums">
      <span>
        <HeatFigure
          stats={stats}
          format={(s) =>
            spool
              ? t('fittings.stats.weaponDpsSpooled', {
                  from: fmt1(spool.unspooledDps),
                  to: fmt1(figures(s).dps),
                })
              : t('fittings.stats.weaponDps', { value: fmt1(figures(s).dps) })
          }
          note={tooltip}
          keys={previewed ? ['totalDps'] : undefined}
        />
      </span>
      <span className="text-text-dim"> · </span>
      <span>
        <HeatFigure
          stats={stats}
          format={(s) =>
            t(spool ? 'fittings.stats.weaponVolleyUnspooled' : 'fittings.stats.weaponVolley', {
              value: fmt0(figures(s).volley),
            })
          }
          keys={previewed ? ['totalVolley'] : undefined}
        />
      </span>
      {tooltip && <span className="sr-only"> ({tooltip})</span>}
    </span>
  );
  if (sustained === 'tooltip' || !reloads) return numbers;
  return (
    <>
      {numbers}
      <span className="block text-right text-[0.6875rem] font-normal text-text-dim tabular-nums">
        <HeatFigure
          stats={stats}
          format={sustainedLabel}
          keys={previewed ? ['sustainedDps'] : undefined}
        />
      </span>
    </>
  );
}

/** "spools up in ~2 min" — seconds under a minute and a half, whole minutes beyond. */
function spoolTimeText(t: TFunction, seconds: number): string {
  return seconds < 90
    ? t('fittings.stats.spoolsUpSeconds', { count: Math.max(1, Math.round(seconds)) })
    : t('fittings.stats.spoolsUpMinutes', { count: Math.round(seconds / 60) });
}

const FIRING: readonly FittingItemState[] = ['active', 'overload'];
const STATE_ORDER: readonly FittingItemState[] = ['offline', 'online', 'active', 'overload'];

/**
 * The fitted modules an Offense row stands for — its type, holding its
 * charge, firing — with the state they share and the highest all can reach.
 */
function weaponGroup(
  row: WeaponRow,
  fitting: Fitting,
  moduleResults: FittingModuleResult[] | null
): { modules: FittingModule[]; shownState?: FittingItemState; maxState?: FittingItemState } {
  const members = fitting.modules.flatMap((module, index) => {
    const result = moduleResults?.[index];
    const state = result?.state ?? module.state;
    return module.typeId === row.typeId &&
      module.chargeTypeId === row.chargeTypeId &&
      FIRING.includes(state)
      ? [{ module, state, maxState: result?.maxState }]
      : [];
  });
  const states = new Set(members.map((member) => member.state));
  const maxStates = members.map((member) => member.maxState);
  const maxState = maxStates.every((state) => state !== undefined)
    ? maxStates.reduce<FittingItemState | undefined>(
        (lowest, state) =>
          lowest === undefined || STATE_ORDER.indexOf(state!) < STATE_ORDER.indexOf(lowest)
            ? state
            : lowest,
        undefined
      )
    : undefined;
  return {
    modules: members.map((member) => member.module),
    ...(states.size === 1 ? { shownState: [...states][0] } : {}),
    ...(maxState === undefined ? {} : { maxState }),
  };
}

/** The Offense section's rows — a weapon group, drone stack or squadron each — and their total. */
export function OffenseRows({
  stats,
  typeName,
  fitting,
  moduleResults,
}: {
  stats: FittingStats;
  typeName: (typeId: number) => string;
  fitting: Fitting | null;
  moduleResults: FittingModuleResult[] | null;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  return (
    <StatRows>
      {stats.offense.weapons.map((row) => {
        const group =
          actions !== null && fitting !== null && !row.isDrone
            ? weaponGroup(row, fitting, moduleResults)
            : null;
        const name = t('fittings.stats.weaponRow', {
          count: row.count,
          name: typeName(row.typeId),
        });
        const hasMenu = group !== null && group.modules.length > 0;
        // Its charge and reach on one dim line, the reach as the HUD tooltip reads it (`rangeText.ts`).
        const detail = joinDetail([
          row.chargeTypeId === undefined ? undefined : typeName(row.chargeTypeId),
          row.isDrone
            ? t(
                row.isFighter
                  ? 'fittings.stats.fightersNoOverheat'
                  : 'fittings.stats.dronesNoOverheat'
              )
            : undefined,
          row.spool ? spoolTimeText(t, row.spool.secondsToFull) : undefined,
          ...(row.range ? rangeLines(t, row.range.optimal, row.range.falloff) : []),
        ]);
        const content = (
          <StatRowContent
            name={name}
            detail={detail}
            figure={
              <DamageFigures
                stats={stats}
                figures={(s) =>
                  s.offense.weapons.find((other) => weaponRowKey(other) === weaponRowKey(row)) ??
                  row
                }
                spool={row.spool}
              />
            }
            action={hasMenu ? <RowMoreActions /> : undefined}
          />
        );
        return hasMenu ? (
          <FittingItemMenu
            key={weaponRowKey(row)}
            name={name}
            items={
              <WeaponMenuItems
                modules={group.modules}
                shownState={group.shownState}
                maxState={group.maxState}
              />
            }
          >
            <li className={statRowClassName()}>{content}</li>
          </FittingItemMenu>
        ) : (
          <li key={weaponRowKey(row)} className={statRowClassName()}>
            {content}
          </li>
        );
      })}
      <li className={statRowClassName(true)}>
        <StatRowContent
          name={t(
            stats.offense.weapons.some((row) => row.spool)
              ? 'fittings.stats.offenseTotalSpooled'
              : 'fittings.stats.offenseTotal'
          )}
          inline
          figure={
            <DamageFigures stats={stats} figures={(s) => s.offense} sustained="line" previewed />
          }
        />
      </li>
    </StatRows>
  );
}
