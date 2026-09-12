/**
 * The colony list, condensed to one line each — see `colonyStrip.ts` for why
 * the card grid became rows.
 *
 * Four columns and nothing else: which planet, how full its budget is, what
 * the worklist raised against it, and how long it lasts. Every row opens the
 * same detail dialog the cards' `Details` button opened, so nothing that was
 * reachable has stopped being reachable — it is one click away instead of
 * six cards down.
 */
import { useTranslation } from 'react-i18next';
import type { ColonyStripRow } from './colonyStripModel';

/** Hours under two days read as hours; beyond that a day count is what a pilot plans in. */
function span(hours: number, t: ReturnType<typeof useTranslation>['t']): string {
  return hours < 48
    ? t('piAdvisor.hoursShort', { count: Math.round(hours) })
    : t('piAdvisor.daysShort', { count: Math.round(hours / 24) });
}

function State({ row }: { row: ColonyStripRow }) {
  const { t } = useTranslation();
  if (row.faults > 0) {
    return (
      <span className="text-right text-xs text-warning tabular-nums">
        {t('piAdvisor.colonyStateFaults', { count: row.faults })}
      </span>
    );
  }
  if (row.steps > 0) {
    return (
      <span className="text-right text-xs text-isk-pos tabular-nums">
        {t('piAdvisor.colonyStateSteps', { count: row.steps })}
      </span>
    );
  }
  // A colony nothing can be read from has not been found to be fine — saying
  // "as is" there would claim a check that never ran.
  if (row.load === null && row.hoursToFull === null) {
    return (
      <span className="text-right text-xs text-text-faint">{t('piAdvisor.colonyUnknown')}</span>
    );
  }
  return (
    <span className="text-right text-xs text-text-dim">{t('piAdvisor.colonyStateClear')}</span>
  );
}

function Row({ row, onOpen }: { row: ColonyStripRow; onOpen: () => void }) {
  const { t } = useTranslation();
  const warn = row.faults > 0;
  const percent = row.load === null ? null : Math.min(100, Math.round(row.load * 100));

  const name = row.name ?? t('pi.planetLabel', { id: row.planetId });

  return (
    <button
      type="button"
      onClick={onOpen}
      // The row *is* the Details control the card footer used to carry, so it
      // keeps that control's accessible name: a button reading "Efa II
      // Temperate 82% 2 faults 62 h" to a screen reader says everything except
      // what pressing it does.
      aria-label={t('piAdvisor.detailsLabel', { name })}
      aria-haspopup="dialog"
      className="group grid w-full grid-cols-[1fr_4.5rem_5rem] items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-panel-2 sm:grid-cols-[1fr_6.5rem_4.5rem_5rem_auto]"
    >
      <span className="min-w-0 truncate text-[0.8125rem]">
        {name}{' '}
        <span className="text-[0.6875rem] text-text-faint">
          {t(`pi.planetType.${row.planetType}`)}
        </span>
      </span>

      <span className="col-span-3 flex h-[5px] gap-[3px] sm:col-span-1">
        {percent === null ? (
          <span className="flex-1 rounded-[1px] bg-line" />
        ) : (
          <>
            <span
              className={`rounded-[1px] ${warn ? 'bg-warning' : 'bg-accent-dim'}`}
              style={{ width: `${percent}%` }}
            />
            <span className="flex-1 rounded-[1px] bg-line" />
          </>
        )}
      </span>

      <span className="col-start-2 row-start-1 sm:col-start-3">
        <State row={row} />
      </span>

      <span
        className={`col-start-3 row-start-1 text-right text-xs tabular-nums sm:col-start-4 ${
          row.hoursToFull === null
            ? 'text-text-faint'
            : row.overflowing
              ? 'text-warning'
              : 'text-text-dim'
        }`}
      >
        {row.hoursToFull === null ? t('piAdvisor.colonyUnknown') : span(row.hoursToFull, t)}
      </span>

      {/*
        Not a nested <button>: the whole row already is one, and a button
        inside a button is invalid markup that browsers resolve by dropping
        one of them. This is the affordance only — without it the row reads as
        a line of text and nobody discovers that it opens anything.
      */}
      <span
        aria-hidden="true"
        className="col-start-3 row-start-1 hidden items-center gap-0.5 justify-self-end rounded-xs border border-line-bright px-1.5 py-[3px] text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase group-hover:border-accent-dim group-hover:text-accent sm:col-start-5 sm:flex"
      >
        {t('piAdvisor.detailsAction')}
      </span>
    </button>
  );
}

/**
 * The slot the pilot does not have yet.
 *
 * A skill-locked colony used to be a whole dashed card at the foot of the tab
 * — planet name, planet type, and one sentence saying the pilot cannot build
 * there. Repeated per uncolonised planet, that was several boxes all carrying
 * the same fact about a *skill*, none of it about the planets they were
 * labelled with. It is one fact, so it is one row, at the end of the list of
 * slots it is about.
 */
function LockedRow({ level, total, atMax }: { level: number; total: number; atMax: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2.5 border-t border-line px-3 py-2">
      <span className="inline-flex h-[1.125rem] shrink-0 items-center rounded-xs border border-line-bright px-1.5 text-[0.625rem] font-bold tracking-widest text-text-faint uppercase">
        {t('piAdvisor.colonySlotLockedTag')}
      </span>
      <span className="min-w-0 text-xs text-text-dim">
        {atMax
          ? t('piAdvisor.colonySlotLockedMax', { total })
          : t('piAdvisor.colonySlotLocked', { level })}
      </span>
    </div>
  );
}

export interface ColonyStripProps {
  rows: readonly ColonyStripRow[];
  onOpenPlanet: (planetId: number) => void;
  /**
   * The slot beyond the last colony, when the pilot cannot have it. Null when
   * a slot is free — there is nothing locked to report — and null on an
   * *assumed* skill level, which is the same rule the ceiling follows: an
   * assumed figure may be shown, never acted on, and "train to level 1" aimed
   * at a pilot who already has level V is worse than silence.
   */
  locked: { level: number; total: number; atMax: boolean } | null;
}

export function ColonyStrip({ rows, onOpenPlanet, locked }: ColonyStripProps) {
  const { t } = useTranslation();
  if (rows.length === 0 && !locked) {
    return <p className="px-3 py-4 text-xs text-text-dim">{t('piAdvisor.colonyStripEmpty')}</p>;
  }
  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <Row key={row.planetId} row={row} onOpen={() => onOpenPlanet(row.planetId)} />
      ))}
      {locked && <LockedRow {...locked} />}
    </div>
  );
}
