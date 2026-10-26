import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  FilterChip,
  Panel,
  SearchInput,
  StatChip,
  StatChips,
  useOpenAfterMenu,
  type DataTableColumn,
} from '@/components/ui';
import { minerDetail, type BookView, type MinerRow } from '@/engine/corpTaxBook/bookView';
import { boolParam, textParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { useBook } from './useBook';
import { isk, shortDate } from './moonsFormat';
import { OverdueWord, StandingWord } from './moonsParts';
import { MinerExpandedRow } from './MinerExpandedRow';
import { MinerRowMenu } from './MinerRowMenu';
import { useCards } from './sectionHelpers';
import { MarkNotTaxDialog, ReasonDialog, RecordPaymentDialog } from './BookDialogs';

const PARAMS = {
  q: textParam(),
  members: boolParam(true),
  guests: boolParam(true),
};

/** A Miner is listed while it owes, is owed, or has days waiting; the rest are only counted. */
const isActive = (m: MinerRow) => m.owed > 0 || m.unbilled > 0 || m.pending > 0 || m.credit > 0;

export function MinersTab() {
  const { t } = useTranslation();
  const { view, names, edit, canEdit } = useBook();
  const [dialog, setDialog] = useState<
    | { kind: 'record' | 'dismiss'; miner: MinerRow }
    | { kind: 'notTax'; miner: MinerRow; paymentId: string }
    | null
  >(null);
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const [tableRef, cards] = useCards();
  const rowContextMenu = useCallback(
    (m: MinerRow, tr: ReactElement) => (
      <MinerRowMenu
        miner={m}
        onRecord={(miner) => run(() => setDialog({ kind: 'record', miner }))}
        onDismiss={(miner) => run(() => setDialog({ kind: 'dismiss', miner }))}
        onNotTax={(miner, paymentId) => run(() => setDialog({ kind: 'notTax', miner, paymentId }))}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {tr}
      </MinerRowMenu>
    ),
    [run, onCloseAutoFocus]
  );
  const [params, setParams] = useUrlParams(PARAMS);
  const nameOf = (m: MinerRow) => names.character(m.mainCharacterId);

  const counts = useMemo(
    () => ({
      members: view.miners.filter((m) => m.standing !== 'guest' && isActive(m)).length,
      guests: view.miners.filter((m) => m.standing === 'guest' && isActive(m)).length,
    }),
    [view.miners]
  );
  const rows = useMemo(() => {
    const q = params.q.trim().toLowerCase();
    return view.miners.filter((m) => {
      const inGroup = m.standing === 'guest' ? params.guests : params.members;
      if (!inGroup || !isActive(m)) return false;
      if (!q) return true;
      return [nameOf(m), ...m.characterIds.map(names.character)].some((n) =>
        n.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` identity changes as names resolve
  }, [view.miners, params, names]);
  // What the Non-members chip being off keeps out of the table.
  const hiddenGuests = params.guests
    ? []
    : view.miners.filter((m) => m.standing === 'guest' && isActive(m));
  const hiddenGuestOwed = hiddenGuests.reduce((sum, m) => sum + m.owed, 0);
  const hidden = view.miners.length - view.miners.filter(isActive).length;

  const columns: DataTableColumn<MinerRow>[] = [
    {
      id: 'miner',
      header: t('corpTaxBook.moons.cols.miner'),
      primary: true,
      render: (m) => (
        <span className="block min-w-0">
          <span className="font-semibold">{nameOf(m)}</span>
          {m.characterIds.length > 1 && (
            <span className="block text-xs text-text-dim">
              {t('corpTaxBook.moons.moreCharacters', { count: m.characterIds.length - 1 })}
            </span>
          )}
          {m.paused && (
            <span className="block text-xs text-warning">{t('corpTaxBook.moons.declared')}</span>
          )}
        </span>
      ),
      sortValue: (m) => nameOf(m),
    },
    {
      id: 'standing',
      header: t('corpTaxBook.moons.cols.inCorp'),
      render: (m) => <StandingWord standing={m.standing} />,
    },
    {
      id: 'owed',
      header: t('corpTaxBook.moons.cols.owed'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (m) => (m.owed ? isk(m.owed) : '—'),
      sortValue: (m) => m.owed,
    },
    {
      id: 'overdue',
      header: t('corpTaxBook.moons.cols.overdue'),
      render: (m) => <OverdueWord days={m.overdueDays} paused={m.paused} />,
      sortValue: (m) => m.overdueDays ?? -1,
    },
    {
      id: 'unbilled',
      header: t('corpTaxBook.moons.cols.unbilled'),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => (m.unbilled ? isk(m.unbilled) : '—'),
      sortValue: (m) => m.unbilled,
    },
    {
      id: 'credit',
      header: t('corpTaxBook.moons.cols.credit'),
      align: 'right',
      className: 'tabular-nums',
      phoneHidden: true,
      render: (m) => (m.credit ? <span className="text-isk-pos">{isk(m.credit)}</span> : '—'),
    },
    {
      id: 'paid',
      header: t('corpTaxBook.moons.cols.lastPaid'),
      render: (m) => (m.lastPaidAt ? shortDate(m.lastPaidAt) : '—'),
      sortValue: (m) => m.lastPaidAt ?? '',
    },
  ];

  return (
    <div className="space-y-4">
      <StatChips>
        <StatChip
          label={t('corpTaxBook.moons.chips.owed')}
          value={isk(view.totals.owed)}
          emphasis
        />
        <StatChip
          label={t('corpTaxBook.moons.chips.overdue')}
          value={t('corpTaxBook.moons.chips.overdueValue', {
            amount: isk(view.totals.overdue),
            count: view.totals.overdueCount,
          })}
          {...(view.totals.overdue > 0 ? { tone: 'danger' as const } : {})}
        />
        <StatChip label={t('corpTaxBook.moons.chips.unbilled')} value={isk(view.totals.unbilled)} />
        <StatChip label={t('corpTaxBook.moons.chips.credit')} value={isk(view.totals.credit)} />
      </StatChips>
      {view.donationsBeforeBook > 0 && (
        <p className="text-xs text-text-dim">
          {t('corpTaxBook.moons.beforeBook.donations', { count: view.donationsBeforeBook })}
        </p>
      )}
      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <SearchInput
            className="min-w-56 flex-1"
            value={params.q}
            onChange={(e) => setParams({ q: e.target.value })}
            placeholder={t('corpTaxBook.moons.miners.search')}
            aria-label={t('corpTaxBook.moons.miners.searchLabel')}
          />
          <FilterChip
            label={t('corpTaxBook.moons.miners.members')}
            selected={params.members}
            onToggle={() => setParams({ members: !params.members })}
            count={counts.members}
          />
          <FilterChip
            label={t('corpTaxBook.moons.miners.nonMembers')}
            selected={params.guests}
            onToggle={() => setParams({ guests: !params.guests })}
            count={counts.guests}
          />
        </div>
        <div ref={tableRef} className="@container overflow-x-auto">
          <DataTable
            label={t('corpTaxBook.moons.tabs.miners')}
            columns={columns}
            rows={rows}
            rowKey={(m) => m.id}
            expandableRow={{
              renderDetail: (m) => <MinerExpandedRow miner={m} />,
              leadingIcon: true,
            }}
            stacked={cards}
            rowClassName={() => 'group'}
            rowContextMenu={rowContextMenu}
            rowMoreActions={canEdit}
            defaultSort={{ columnId: 'overdue', direction: 'desc' }}
            mobileSort
            stackSummary={t('corpTaxBook.moons.miners.summary', {
              shown: rows.length,
              total: view.miners.length,
            })}
          />
        </div>
        {hiddenGuests.length > 0 && (
          <p className="border-t border-line px-3 py-2 text-xs text-text-dim">
            {t('corpTaxBook.moons.miners.nonMembersHidden', {
              count: hiddenGuests.length,
              amount: isk(hiddenGuestOwed),
            })}
          </p>
        )}
        {hidden > 0 && (
          <p className="border-t border-line px-3 py-2 text-xs text-text-dim">
            {t('corpTaxBook.moons.miners.hidden', { count: hidden })}
          </p>
        )}
      </Panel>
      {dialog?.kind === 'record' && (
        <RecordPaymentDialog
          open
          onClose={() => setDialog(null)}
          miner={dialog.miner}
          minerName={names.character(dialog.miner.mainCharacterId)}
          defaultAmount={dialog.miner.owed}
          statementId={openStatementId(view, dialog.miner.id)}
        />
      )}
      {dialog?.kind === 'notTax' &&
        (() => {
          const payment = view.internals.byMiner
            .get(dialog.miner.id)
            ?.payments.find((p) => p.id === dialog.paymentId);
          return payment ? (
            <MarkNotTaxDialog
              open
              onClose={() => setDialog(null)}
              payment={payment}
              fromName={names.character(payment.characterId)}
            />
          ) : null;
        })()}
      {dialog?.kind === 'dismiss' && (
        <ReasonDialog
          open
          onClose={() => setDialog(null)}
          title={t('corpTaxBook.moons.dialogs.dismissMiner.title', {
            name: names.character(dialog.miner.mainCharacterId),
          })}
          intro={t('corpTaxBook.moons.dialogs.dismissMiner.intro')}
          reasonLabel={t('corpTaxBook.moons.dialogs.reasonShown')}
          confirmLabel={t('corpTaxBook.moons.dialogs.dismissConfirm', {
            amount: isk(dialog.miner.owed + dialog.miner.unbilled),
          })}
          run={async (reason) => {
            await edit({
              action: 'dismiss',
              scope: 'miner',
              targetId: dialog.miner.id,
              reason,
              amountIsk: dialog.miner.owed + dialog.miner.unbilled,
            });
          }}
        />
      )}
    </div>
  );
}

/** The Statement a payment recorded from the Miners table settles: the Miner's first unsettled one. */
function openStatementId(view: BookView, minerId: string): string | undefined {
  return minerDetail(view, minerId)?.statements.find(
    (s) => !view.internals.byMiner.get(minerId)?.allocation.byStatement.get(s.id)?.settled
  )?.id;
}
