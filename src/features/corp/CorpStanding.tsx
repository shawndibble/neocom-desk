/**
 * The Standing panel: the two or three figures a corp manager acts on, with the
 * Deadline Strip beside them (issue #566).
 *
 * Answer first, list second. The old overview made you read thirteen rows to
 * learn "there is a lot due soon"; this states it, and the strip says when.
 *
 * **Gated figure by figure, not panel by panel.** The clocks come from the
 * board's three sources and the money from the wallet, and a Character can hold
 * either without the other. A Station Manager who is not an Accountant gets the
 * clock figures and no money ones — absent, not blank, not "you cannot see
 * this" (CONTEXT.md round 35, AC3). With neither readable the caller renders no
 * panel at all, which is why both props are nullable and the empty case returns
 * `null` rather than an empty state.
 */
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { formatIskCompact } from '@/lib/isk';
import { VITALS_WINDOW_DAYS } from '@/engine/corp/vitals';
import type { DeadlineDay, DueSoonCount } from '@/engine/corp/deadlines';
import { CorpDeadlineStrip } from './CorpDeadlineStrip';

/** What the board's own sources contribute: the clocks. `null` when none was read. */
export interface CorpStandingClocks {
  due: DueSoonCount;
  days: readonly DeadlineDay[];
}

/** What the wallet contributes. `null` without `canReadWallet`. */
export interface CorpStandingMoney {
  total: number;
  net: number;
  /** `null` is not zero days — see `CorpVitalsRail`. */
  runwayDays: number | null;
  divisionCount: number;
}

interface CorpStandingProps {
  clocks: CorpStandingClocks | null;
  money: CorpStandingMoney | null;
}

/**
 * One hero figure. `text-3xl` is the only tier DESIGN.md §2 reserves for a hero
 * number, and this is the surface it was reserved for.
 */
function Figure({
  label,
  value,
  unit,
  note,
  tone = '',
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-[8rem] flex-col justify-center gap-1">
      <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </p>
      <p className={`text-3xl leading-tight font-semibold tabular-nums ${tone}`}>
        {value}
        {unit && <span className="text-base font-medium text-text-dim"> {unit}</span>}
      </p>
      <p className="text-xs text-text-dim">{note}</p>
    </div>
  );
}

export function CorpStanding({ clocks, money }: CorpStandingProps) {
  const { t } = useTranslation();

  if (clocks === null && money === null) return null;

  return (
    <Panel title={t('corp.standing.title')}>
      {/*
        `flex-wrap` with a `min-w-0 flex-1` strip: below `lg` the strip drops
        under the figures at full width rather than squeezing fourteen bars into
        a phone's worth of pixels, and the figures keep their own row.
      */}
      <div className="flex flex-wrap items-stretch gap-x-6 gap-y-4">
        {/*
          No `shrink-0` here: it sizes this row to its own max-content width, so
          `flex-wrap` never gets a reason to wrap and three figures overflow a
          390px viewport (measured at 576px before this). `min-w-0` lets it
          shrink, and the figures wrap instead.
        */}
        <div className="flex min-w-0 flex-wrap items-stretch gap-x-6 gap-y-4">
          {clocks && (
            <Figure
              label={t('corp.standing.dueSoon')}
              value={String(clocks.due.total)}
              note={
                clocks.due.overdue > 0
                  ? t('corp.standing.dueSoonOverdue', { count: clocks.due.overdue })
                  : t('corp.standing.dueSoonNoneLate')
              }
              tone={clocks.due.total > 0 ? 'text-danger' : ''}
            />
          )}
          {money && (
            <>
              <span aria-hidden="true" className="hidden w-px shrink-0 bg-line sm:block" />
              <Figure
                label={t('corp.vitals.runway')}
                // Floored, like the rail's own chip: a runway of 38.7 days is
                // 38 days you can rely on, and rounding up would promise one
                // the journal does not support.
                value={
                  money.runwayDays === null
                    ? t('corp.vitals.runwayUnknown')
                    : String(Math.floor(money.runwayDays))
                }
                unit={
                  money.runwayDays === null
                    ? undefined
                    : t('corp.standing.runwayUnit', { count: Math.floor(money.runwayDays) })
                }
                note={t('corp.standing.runwayNote')}
              />
              <span aria-hidden="true" className="hidden w-px shrink-0 bg-line sm:block" />
              <Figure
                label={t('corp.vitals.net', { days: VITALS_WINDOW_DAYS })}
                value={formatIskCompact(money.net)}
                note={t('corp.standing.heldNote', {
                  total: formatIskCompact(money.total),
                  count: money.divisionCount,
                })}
                tone={money.net < 0 ? 'text-isk-neg' : 'text-isk-pos'}
              />
            </>
          )}
        </div>
        {clocks && (
          <>
            <span aria-hidden="true" className="hidden w-px shrink-0 bg-line lg:block" />
            <CorpDeadlineStrip days={clocks.days} />
          </>
        )}
      </div>
    </Panel>
  );
}
