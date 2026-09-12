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
      className="grid w-full grid-cols-[1fr_4.5rem_5rem] items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-panel-2 sm:grid-cols-[1fr_6.5rem_4.5rem_5rem]"
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
    </button>
  );
}

export function ColonyStrip({
  rows,
  onOpenPlanet,
}: {
  rows: readonly ColonyStripRow[];
  onOpenPlanet: (planetId: number) => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <p className="px-3 py-4 text-xs text-text-dim">{t('piAdvisor.colonyStripEmpty')}</p>;
  }
  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <Row key={row.planetId} row={row} onOpen={() => onOpenPlanet(row.planetId)} />
      ))}
    </div>
  );
}
