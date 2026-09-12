/**
 * The Advisor's lead: one ranked list of things to go and do.
 *
 * `DirectiveRow` renders one instruction on one card. This renders the whole
 * tab's instructions as a table, because the question it answers — *which* of
 * these should I do — is a comparison across planets, and a comparison needs
 * the figures in one column. The planet becomes a column rather than a
 * container; see `worklistModel.ts` for why the cards stopped being the unit.
 *
 * Two tables, not one with a flag. Tuning steps add up; a rebuild is what a
 * planet would earn *instead*. They are separated by a labelled band that says
 * so, and nothing here ever sums across it.
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatIsk } from '@/lib/isk';
import { VerbTag, type DirectiveVerb } from './DirectiveRow';
import { layoutLabel } from './colonyPlan';
import type { Worklist as WorklistData, WorklistRow } from './worklistModel';

/** Every worklist verb is a directive verb; `haul` reads as a fault, like `remove`. */
const VERB: Record<WorklistRow['verb'], DirectiveVerb> = {
  haul: 'remove',
  remove: 'remove',
  add: 'add',
  swap: 'swap',
  rebuild: 'rebuild',
};

/** Hours under a day read as hours; beyond that a day count is what a pilot plans in. */
function span(hours: number, t: TFunction): string {
  return hours < 48
    ? t('piAdvisor.hoursShort', { count: Math.round(hours) })
    : t('piAdvisor.daysShort', { count: Math.round(hours / 24) });
}

function Worth({ row }: { row: WorklistRow }) {
  const { t } = useTranslation();
  // The extraction a removal pays for: the facilities it reaches. No ISK,
  // because this row genuinely has none — see `worklistModel.ts`.
  if (row.iskPerHour === null && row.unitsPerHour !== undefined) {
    return (
      <span className="text-right text-xs font-semibold whitespace-nowrap tabular-nums text-accent">
        {t('piAdvisor.worklistFeeds', { count: row.wouldFeed ?? 0 })}
      </span>
    );
  }
  // A removal's value is budget, not money. Rendering a zero here would say
  // "this is worth nothing", which is the opposite of what it means.
  if (row.iskPerHour === null) {
    return (
      <span className="text-right text-xs font-semibold whitespace-nowrap tabular-nums text-warning">
        {t('piAdvisor.worklistFreed', { cpu: row.freed?.cpu.toLocaleString() ?? '0' })}
        <span className="block text-[0.6875rem] font-normal text-text-dim">
          {t('piAdvisor.worklistFreedSub', {
            powergrid: row.freed?.powergrid.toLocaleString() ?? '0',
          })}
        </span>
      </span>
    );
  }
  return (
    <span className="text-right text-xs font-semibold whitespace-nowrap tabular-nums text-isk-pos">
      {t('piAdvisor.gainValue', { isk: formatIsk(row.iskPerHour) })}
      <span className="ml-1 text-[0.6875rem] font-normal text-text-dim">
        {t('piAdvisor.worklistIsk')}
      </span>
    </span>
  );
}

function Step({ row }: { row: WorklistRow }) {
  const { t } = useTranslation();
  if (row.verb === 'haul' && row.window) {
    return <>{t('piAdvisor.rowHaul', { hours: span(row.window.hoursToFull, t) })}</>;
  }
  if (row.verb === 'remove') {
    return (
      <>
        {t('piAdvisor.rowRemove', {
          count: row.pinCount ?? 0,
          pin: t('piAdvisor.pinKind.basic'),
        })}
      </>
    );
  }
  if (row.key.endsWith(':add:freed')) {
    return (
      <>
        {t('piAdvisor.rowAddHeads', {
          count: row.heads ?? 0,
          units: Math.round(row.unitsPerHour ?? 0).toLocaleString(),
          name: row.label,
        })}
      </>
    );
  }
  if (row.verb === 'rebuild' && row.pins) {
    return (
      <>
        {t('piAdvisor.rowRebuildAround', {
          name: row.label,
          tier: row.tier ?? 0,
          layout: layoutLabel(row.pins, t),
        })}
      </>
    );
  }
  return <>{row.label}</>;
}

function Row({ row, rank, dim }: { row: WorklistRow; rank: number; dim?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className={`grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 last:border-b-0 sm:grid-cols-[1.5rem_1fr_11rem_8rem] ${
        dim ? 'opacity-80' : ''
      }`}
    >
      <span className="text-xs text-text-faint tabular-nums">{rank}</span>
      <span className="flex min-w-0 items-baseline gap-2">
        <VerbTag verb={VERB[row.verb]} />
        <span className="text-xs text-text">
          <Step row={row} />
        </span>
      </span>
      <span className="col-start-2 flex flex-col gap-0.5 sm:col-start-3">
        <span className="text-xs text-text">
          {row.planetName ?? t('pi.planetLabel', { id: row.planetId })}
        </span>
        <span className="text-[0.6875rem] text-text-dim">
          {row.verb === 'haul' && row.window
            ? t('piAdvisor.rowHaulWhere', {
                full: span(row.window.hoursToFull, t),
                window: span(row.window.haulHours, t),
              })
            : t(`pi.planetType.${row.planetType}`)}
        </span>
      </span>
      <Worth row={row} />
    </div>
  );
}

/**
 * Which of the two lists the table is showing.
 *
 * Two chips rather than a checkbox: the choice is between two readings of the
 * same colonies — "what can I do without tearing anything down" and "what if I
 * were willing to" — and a checkbox labelled "include rebuilds" makes the
 * second look like extra rows of the first. It is not; nothing sums across the
 * band. Tuning-only leads because it is the answer a pilot can act on today.
 */
export function WorklistToggle({
  includeRebuilds,
  onChange,
  rebuildCount,
}: {
  includeRebuilds: boolean;
  onChange: (includeRebuilds: boolean) => void;
  rebuildCount: number;
}) {
  const { t } = useTranslation();
  // Nothing to include, so nothing to offer: a chip that toggles between an
  // empty list and the same empty list is a control that does nothing.
  if (rebuildCount === 0) return null;
  const chip = (active: boolean) =>
    `rounded-xs px-2.5 py-[3px] text-[0.625rem] font-semibold tracking-widest uppercase ${
      active
        ? 'border border-accent-dim bg-accent/10 text-accent'
        : 'border border-line-bright text-text-dim hover:text-text'
    }`;
  return (
    <div className="flex gap-1.5">
      <button type="button" className={chip(!includeRebuilds)} onClick={() => onChange(false)}>
        {t('piAdvisor.worklistTuningOnly')}
      </button>
      <button type="button" className={chip(includeRebuilds)} onClick={() => onChange(true)}>
        {t('piAdvisor.worklistIncludeRebuilds')}
      </button>
    </div>
  );
}

export function Worklist({
  list,
  includeRebuilds = true,
}: {
  list: WorklistData;
  includeRebuilds?: boolean;
}) {
  const { t } = useTranslation();
  const { tuning } = list;
  const rebuilds = includeRebuilds ? list.rebuilds : [];

  if (tuning.length === 0 && rebuilds.length === 0) {
    // "Nothing to change" would be a lie while rebuilds are merely hidden.
    return (
      <p className="px-3 py-4 text-xs text-text-dim">
        {list.rebuilds.length > 0
          ? t('piAdvisor.worklistTuningNone')
          : t('piAdvisor.worklistEmpty')}
      </p>
    );
  }

  return (
    <div>
      <div className="hidden grid-cols-[1.5rem_1fr_11rem_8rem] gap-x-3 border-b border-line bg-panel-2 px-3 py-1.5 sm:grid">
        <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
          #
        </span>
        <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piAdvisor.worklistColStep')}
        </span>
        <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piAdvisor.worklistColWhere')}
        </span>
        <span className="text-right text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piAdvisor.worklistColWorth')}
        </span>
      </div>

      {tuning.map((row, index) => (
        <Row key={row.key} row={row} rank={index + 1} />
      ))}

      {rebuilds.length > 0 && (
        <>
          {/*
            A labelled band, not a subtler divider. The figures below it are
            measured from the same starting point as the ones above, so the one
            thing a reader must not do is add them — and the only reliable way
            to stop that is to say it in words where the change happens.
          */}
          <div className="border-y border-line bg-panel-2 px-3 py-1.5">
            <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('piAdvisor.worklistRebuildsLabel')}
            </span>
          </div>
          {rebuilds.map((row, index) => (
            <Row key={row.key} row={row} rank={tuning.length + index + 1} dim />
          ))}
          <p className="px-3 py-2 text-[0.6875rem] text-text-dim">
            {t('piAdvisor.worklistRebuildsHint')}
          </p>
        </>
      )}
    </div>
  );
}
