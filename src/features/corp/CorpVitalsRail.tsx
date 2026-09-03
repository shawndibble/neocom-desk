/**
 * The compact rail beside the board: what the corporation holds, what it is
 * spending, and how long that lasts.
 *
 * Deliberately small. The board's ranking is the feature; this answers the one
 * question the ranking cannot — whether the corporation can still pay for the
 * fuel and bills those clocks are counting down to.
 *
 * Rendered only when the Character holds `canReadWallet` (`Corp.tsx`). A
 * Station Manager who is not an Accountant simply has no rail: no error, no
 * empty state, nothing (CONTEXT.md round 35, AC3).
 */
import { useTranslation } from 'react-i18next';
import { Panel, StatChip } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import {
  VITALS_WINDOW_DAYS,
  dailyOutgoings,
  netOverWindow,
  runwayDays,
  totalBalance,
  type VitalsJournalEntry,
} from '@/engine/corp/vitals';
import type { CorporationWalletDivision } from '@/esi/endpoints';

interface CorpVitalsRailProps {
  divisions: readonly CorporationWalletDivision[];
  /** The corporation's own names for its divisions, from `read_divisions`. */
  divisionNames: ReadonlyMap<number, string>;
  /** Master-division journal, already reduced. Empty when it could not be read. */
  journal: readonly VitalsJournalEntry[];
  /** Captured by the loader — `Date.now()` in render is impure and React forbids it. */
  nowMs: number;
}

export function CorpVitalsRail({ divisions, divisionNames, journal, nowMs }: CorpVitalsRailProps) {
  const { t } = useTranslation();

  const total = totalBalance(divisions);
  const net = netOverWindow(journal, nowMs);
  const runway = runwayDays(total, dailyOutgoings(journal, nowMs));

  return (
    <Panel title={t('corp.vitalsTitle')}>
      <div className="space-y-3">
        <dl className="divide-y divide-line text-xs">
          {divisions.map((division) => (
            <div key={division.division} className="flex items-baseline justify-between gap-3 py-2">
              {/*
                The corporation's own name where it gave one — that is what
                `read_divisions` is a separate scope for. A division still on
                its default has no name to show, and the number is what the
                client calls it too.
              */}
              <dt className="min-w-0 truncate text-text-dim">
                {divisionNames.get(division.division) ??
                  t('corp.vitals.division', { division: division.division })}
              </dt>
              <dd className="shrink-0 tabular-nums">{formatIsk(division.balance, 2)}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-1.5">
          <StatChip label={t('corp.vitals.total')} value={formatIsk(total, 2)} />
          <StatChip
            label={t('corp.vitals.net', { days: VITALS_WINDOW_DAYS })}
            value={formatIsk(net, 2)}
            tone={net < 0 ? 'danger' : 'success'}
          />
          <StatChip
            label={t('corp.vitals.runway')}
            tooltip={t('corp.vitals.runwayHint', { days: VITALS_WINDOW_DAYS })}
            // `null` is not "zero days" — it is a corporation that has spent
            // nothing, or has nothing left, and either way the journal cannot
            // support a figure. The engine says so and the rail repeats it.
            value={
              runway === null
                ? t('corp.vitals.runwayUnknown')
                : t('corp.vitals.runwayDays', { count: Math.floor(runway) })
            }
            tone={runway !== null && runway < 30 ? 'warning' : 'default'}
          />
        </div>
      </div>
    </Panel>
  );
}
