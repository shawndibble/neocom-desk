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
import { Link } from 'react-router-dom';
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
import type { WalletDivision } from './divisions';

interface CorpVitalsRailProps {
  /** Balances joined to the corporation's own names — `divisions.ts` (#298). */
  divisions: readonly WalletDivision[];
  /** The journal, already reduced. Empty when it could not be read. */
  journal: readonly VitalsJournalEntry[];
  /**
   * Which division `journal` came from. The runway divides that division's own
   * balance by its own spending — see the chip below for why the two halves
   * must describe the same wallet.
   */
  journalDivision: number;
  /** Captured by the loader — `Date.now()` in render is impure and React forbids it. */
  nowMs: number;
}

export function CorpVitalsRail({
  divisions,
  journal,
  journalDivision,
  nowMs,
}: CorpVitalsRailProps) {
  const { t } = useTranslation();

  const total = totalBalance(divisions);
  const net = netOverWindow(journal, nowMs);
  /**
   * Both halves of the runway come from the same wallet, deliberately.
   *
   * ESI publishes no all-divisions journal and the seven are separately
   * role-gated, so the spending figure can only ever be one division's. Putting
   * *every* division's balance over one division's spending would answer a
   * question nobody asked — a corporation that pays its bills out of division 3
   * would read as having years of runway — and the tooltip would be describing
   * a calculation that never ran.
   */
  const journalBalance =
    divisions.find((division) => division.division === journalDivision)?.balance ?? 0;
  const runway = runwayDays(journalBalance, dailyOutgoings(journal, nowMs));

  return (
    <Panel title={t('corp.vitalsTitle')}>
      <div className="space-y-3">
        {/*
          A plain div, not a `<dl>`: nothing else here reads it as a
          description list (`CorpPeopleRail` right beside it is plain divs
          and `StatChip`s), and a `<dt>`/`<dd>` pair nested inside an `<a>`
          isn't a `<dl>`'s allowed content model — the link's own implicit
          role already names each row, so no ARIA list role is needed either.
        */}
        <div className="divide-y divide-line text-xs">
          {divisions.map((division) => {
            const label =
              division.name ?? t('corp.vitals.division', { division: division.division });
            return (
              // The whole row is the link (issue #419) — the matching Wallet
              // division view, not a second read of it. `owner=corporation`
              // is what actually opens Wallet's corp side; `division` alone
              // would land on Personal with the param unused.
              <Link
                key={division.division}
                to={`/wallet?owner=corporation&division=${division.division}`}
                className="flex items-baseline justify-between gap-3 py-2 hover:underline"
                aria-label={t('corp.vitals.viewInWallet', { division: label })}
              >
                {/*
                  The corporation's own name where it gave one — that is what
                  `read_divisions` is a separate scope for. A division still on
                  its default has no name to show, and the number is what the
                  client calls it too.
                */}
                <span className="min-w-0 truncate text-text-dim">{label}</span>
                <span className="shrink-0 tabular-nums">{formatIsk(division.balance, 2)}</span>
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatChip label={t('corp.vitals.total')} value={formatIsk(total, 2)} />
          <StatChip
            label={t('corp.vitals.net', { days: VITALS_WINDOW_DAYS })}
            value={formatIsk(net, 2)}
            tone={net < 0 ? 'danger' : 'success'}
          />
          <StatChip
            label={t('corp.vitals.runway')}
            tooltip={t('corp.vitals.runwayHint', {
              days: VITALS_WINDOW_DAYS,
              division:
                divisions.find((division) => division.division === journalDivision)?.name ??
                journalDivision,
            })}
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
