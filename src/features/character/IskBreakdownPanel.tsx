/**
 * "Where the ISK went" (issue #3908): the right side panel the Journal opens.
 * It reads the Journal's own filters, so its totals are the Journal's
 * filtered In / Out / Net, and a ref type clicked here is the Journal's
 * ref-type filter. Non-modal (`SlideOver`): the Journal stays live behind it.
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  ProgressBar,
  SegmentedControl,
  SlideOver,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import type { JournalCoverage } from '@/engine/journalNetting';
import { netToneClass } from '@/features/character/format';
import { journalRefLabel } from '@/features/character/journalRefLabel';
import { useJournalBreakdownView } from '@/features/character/journalBreakdownViewPref';
import {
  MARKET_TRADES_KEY,
  MARKET_TRADES_REF_TYPE,
  type JournalBreakdown,
  type PartyBreakdownRow,
  type RefTypeBreakdownRow,
} from '@/features/character/walletJournalFilter';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { signedIsk } from '@/lib/signedIsk';
import { formatIsk } from '@/lib/isk';

interface IskBreakdownPanelProps {
  open: boolean;
  onClose: () => void;
  /** The Character scope in words, e.g. "All characters". */
  scopeLabel: string;
  /** The date range in words, e.g. "last 30 days". */
  rangeLabel: string;
  /** The Journal's filtered rows: the totals. */
  totals: JournalBreakdown;
  /** The Journal's rows without its ref-type filter: the list, so the picked row stays among the rest. */
  breakdown: JournalBreakdown;
  selectedRefType: string | null;
  onSelectRefType: (refType: string) => void;
  /**
   * The personal journal's By party list: every Journal Party in the rows without
   * the party filter. Absent on the corp journal, which has no By party view.
   */
  parties?: {
    rows: readonly PartyBreakdownRow[];
    nameFor: (id: number) => string;
    selected: string | null;
    onSelect: (partyId: number) => void;
  };
  /**
   * Own-Character netting data (coverage note, "Between your Characters"):
   * absent for the corp journal and a one-Character account, which net nothing.
   */
  coverage?: JournalCoverage;
  /**
   * Where the daily chart (#3914) goes: under the In / Out / Net totals,
   * above the ref-type list.
   */
  chart?: ReactNode;
}

export function IskBreakdownPanel({
  open,
  onClose,
  scopeLabel,
  rangeLabel,
  totals,
  breakdown,
  selectedRefType,
  onSelectRefType,
  parties,
  coverage,
  chart,
}: IskBreakdownPanelProps) {
  const { t } = useTranslation();
  const storedView = useJournalBreakdownView((state) => state.value);
  const setView = useJournalBreakdownView((state) => state.setValue);
  const hydrated = useHydratedStore(useJournalBreakdownView);
  const view = parties && hydrated ? storedView : 'type';
  const maxNet = useMemo(
    () => Math.max(0, ...breakdown.rows.map((row) => Math.abs(row.net))),
    [breakdown.rows]
  );
  const columns = useMemo<DataTableColumn<RefTypeBreakdownRow>[]>(
    () => [
      {
        id: 'refType',
        stickyStart: true,
        header: t('wallet.journalBreakdownRefType'),
        render: (row) => (
          <span className="block min-w-0">
            {journalRefLabel(row.refType, t)}
            <ProgressBar
              label={t('wallet.journalBreakdownShare', {
                type: journalRefLabel(row.refType, t),
              })}
              value={Math.abs(row.net)}
              max={maxNet || 1}
              size="xs"
              tone={row.net >= 0 ? 'success' : 'danger'}
              className="mt-1 w-full"
            />
          </span>
        ),
        sortValue: (row) => journalRefLabel(row.refType, t),
      },
      {
        id: 'net',
        header: t('wallet.journalBreakdownNet'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (row) => netToneClass(row.net),
        render: (row) => signedIsk(row.net, 0),
        sortValue: (row) => row.net,
      },
    ],
    [t, maxNet]
  );
  const maxPartyNet = useMemo(
    () => Math.max(0, ...(parties?.rows ?? []).map((row) => Math.abs(row.net))),
    [parties?.rows]
  );
  const partyLabel = useCallback(
    (row: PartyBreakdownRow) =>
      row.partyId === null
        ? t('wallet.journalMarketTrades')
        : (parties?.nameFor(row.partyId) ?? ''),
    [parties, t]
  );
  const partyColumns = useMemo<DataTableColumn<PartyBreakdownRow>[]>(
    () => [
      {
        id: 'party',
        stickyStart: true,
        header: t('wallet.journalBreakdownParty'),
        render: (row) => (
          <span className="block min-w-0">
            {partyLabel(row)}
            <ProgressBar
              label={t('wallet.journalBreakdownShare', { type: partyLabel(row) })}
              value={Math.abs(row.net)}
              max={maxPartyNet || 1}
              size="xs"
              tone={row.net >= 0 ? 'success' : 'danger'}
              className="mt-1 w-full"
            />
          </span>
        ),
        sortValue: partyLabel,
      },
      {
        id: 'in',
        header: t('wallet.journalBreakdownIn'),
        align: 'right',
        className: 'tabular-nums text-isk-pos',
        render: (row) => formatIsk(row.income),
        sortValue: (row) => row.income,
      },
      {
        id: 'out',
        header: t('wallet.journalBreakdownOut'),
        align: 'right',
        className: 'tabular-nums text-isk-neg',
        render: (row) => formatIsk(row.expense),
        sortValue: (row) => row.expense,
      },
      {
        id: 'net',
        header: t('wallet.journalBreakdownNet'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (row) => netToneClass(row.net),
        render: (row) => signedIsk(row.net, 0),
        sortValue: (row) => row.net,
      },
    ],
    [t, partyLabel, maxPartyNet]
  );
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={t('wallet.journalBreakdownTitle')}
      subtitle={t('wallet.journalPanelSubtitle', { scope: scopeLabel, range: rangeLabel })}
    >
      <div className="space-y-4">
        <StatChips>
          <StatChip
            label={t('wallet.journalBreakdownIn')}
            value={<span className="text-isk-pos">{formatIsk(totals.totalIn)}</span>}
          />
          <StatChip
            label={t('wallet.journalBreakdownOut')}
            value={<span className="text-isk-neg">{formatIsk(totals.totalOut)}</span>}
          />
          <StatChip
            label={t('wallet.journalBreakdownNet')}
            emphasis
            value={<span className={netToneClass(totals.net)}>{signedIsk(totals.net, 0)}</span>}
          />
        </StatChips>
        {chart}
        {parties && (
          <SegmentedControl
            label={t('wallet.journalBreakdownViewLabel')}
            size="sm"
            options={[
              { value: 'type', label: t('wallet.journalBreakdownByType') },
              { value: 'party', label: t('wallet.journalBreakdownByParty') },
            ]}
            value={view}
            onChange={(next) => void setView(next)}
          />
        )}
        {parties && view === 'party' && parties.rows.length > 0 && (
          <DataTable
            label={t('wallet.journalBreakdownByParty')}
            columns={partyColumns}
            rows={parties.rows}
            rowKey={(row) => row.key}
            density="compact"
            responsive="table"
            defaultSort={{ columnId: 'net', direction: 'desc' }}
            selectedRowKey={
              selectedRefType === MARKET_TRADES_REF_TYPE ? MARKET_TRADES_KEY : parties.selected
            }
            onRowClick={(row) =>
              row.partyId === null
                ? onSelectRefType(MARKET_TRADES_REF_TYPE)
                : parties.onSelect(row.partyId)
            }
          />
        )}
        {view === 'type' && breakdown.rows.length > 0 && (
          <DataTable
            label={t('wallet.journalBreakdownTitle')}
            columns={columns}
            rows={breakdown.rows}
            rowKey={(row) => row.refType}
            density="compact"
            responsive="table"
            defaultSort={{ columnId: 'net', direction: 'desc' }}
            selectedRowKey={selectedRefType}
            onRowClick={(row) => onSelectRefType(row.refType)}
          />
        )}
        {coverage && <JournalCoverageNote coverage={coverage} />}
        {coverage && <BetweenYourCharactersRow count={totals.internalCount} />}
      </div>
    </SlideOver>
  );
}

/** "N of M Characters loaded", naming those left out, when any is. */
function JournalCoverageNote({ coverage }: { coverage: JournalCoverage }) {
  const { t } = useTranslation();
  if (coverage.missing.length === 0) return null;
  return (
    <p className="text-xs text-warning">
      {t('wallet.journalCoverage', { loaded: coverage.loaded, total: coverage.total })}{' '}
      {t('wallet.journalCoverageMissing', {
        names: coverage.missing.map((c) => c.name).join(', '),
      })}
    </p>
  );
}

/** The own-Character transfers left out of In and Out, with what counts and what does not. */
export function BetweenYourCharactersRow({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <div className="text-sm text-text-dim">
      {t('wallet.journalBetween', { count })}
      <span className="block text-xs">{t('wallet.journalBetweenHelp')}</span>
    </div>
  );
}
