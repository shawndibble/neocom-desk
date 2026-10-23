/**
 * The officer queue (issue #4853, epic #4608): a summary line, Pending / Owed / History, the
 * claim tables with their per-row and bulk actions, the claim detail and the activity feed. Pure
 * view of what `useSrpQueue` loaded; every change goes through its callables and reloads.
 */
import { useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  Panel,
  SegmentedControl,
  Tabs,
  Toast,
  type DataTableColumn,
} from '@/components/ui';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { useTimeZone } from '@/lib/timeFormat';
import { useIsPhone } from '@/lib/useIsPhone';
import type { SrpBatchOutcome, SrpClaim, SrpClaimOutcome } from '../srpClaimTypes';
import type { ClaimColumnsContext } from './claimColumnsContext';
import {
  owedColumns,
  pendingColumns,
  historyColumns,
  phoneHistoryColumns,
  phoneOwedColumns,
  phonePendingColumns,
} from './OfficerClaimColumns';
import { ChangeAmountDialog, RejectClaimDialog } from './OfficerDialogs';
import { SrpActivityFeed } from './SrpActivityFeed';
import { SrpBulkBar } from './SrpBulkBar';
import { SrpClaimDetail } from './SrpClaimDetail';
import { failureText } from './srpClaimText';
import {
  approveAmount,
  canBulkApprove,
  pruneSelection,
  splitClaims,
  sumAmounts,
  type QueueTab,
} from './srpQueue';
import { useSrpClaimNames } from './useSrpClaimNames';
import type { SrpQueueData, SrpQueueState } from './useSrpQueue';

type Ready = Extract<SrpQueueState, { status: 'ready' }>;

const COPIED_MS = 2500;
const QUEUE_TABS: readonly QueueTab[] = ['pending', 'owed', 'history'];

export function OfficerQueue({ data, ready }: { data: SrpQueueData; ready: Ready }) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const tabsId = useId();
  const zone = useTimeZone();
  const names = useSrpClaimNames();
  const { copied, flash } = useCopyFeedback<number>(COPIED_MS);
  const [tab, setTab] = useState<QueueTab>('pending');
  const [selection, setSelection] = useState<number[]>([]);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [rejecting, setRejecting] = useState<SrpClaim | null>(null);
  const [changing, setChanging] = useState<SrpClaim | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const split = useMemo(() => splitClaims(ready.claims), [ready.claims]);
  const rows = tab === 'pending' ? split.pending : tab === 'owed' ? split.owed : split.history;
  const selectable = tab === 'pending' ? rows.filter(canBulkApprove) : tab === 'owed' ? rows : [];
  // Ticks belong to the rows they were made on: a claim another officer closed drops off.
  const ticked = pruneSelection(selection, selectable);
  const owed = sumAmounts(split.owed);
  const open = ready.claims.find((c) => c.killmailId === openId) ?? null;

  const changeTab = (next: QueueTab) => {
    setTab(next);
    setSelection([]);
  };

  /** Runs one officer change; a refusal becomes a line, never an unhandled rejection. */
  const run = useCallback(
    async (action: () => Promise<string>) => {
      setBusy(true);
      try {
        setToast(await action());
      } catch (error) {
        setToast(failureText(t, error));
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  const batchLine = (done: 'approvedMany' | 'paidMany', outcome: SrpBatchOutcome): string => {
    const ok = outcome.results.filter((r) => r.ok).length;
    const refused = outcome.results.flatMap((r) =>
      r.ok
        ? []
        : [t(`srp.officer.failed.${r.reason}`, { defaultValue: t('srp.officer.failed.generic') })]
    );
    const head = t(`srp.officer.results.${done}`, { ok, total: outcome.results.length });
    return refused.length === 0
      ? head
      : `${head}. ${t('srp.officer.results.someFailed', {
          count: refused.length,
          reasons: [...new Set(refused)].join(' '),
        })}`;
  };

  const pilotIsk = (o: SrpClaimOutcome) => ({
    pilot: o.characterName ?? '',
    isk: formatIsk(o.amount ?? 0),
  });

  const approve = (claim: SrpClaim) => {
    const amount = approveAmount(claim, typed[claim.killmailId]);
    if (amount === null) return;
    void run(async () => {
      const out = await data.approve({
        killmailId: claim.killmailId,
        ...(claim.amount === null ? { amount } : {}),
      });
      setOpenId(null);
      return t('srp.officer.results.approved', pilotIsk(out));
    });
  };

  const markPaid = (claim: SrpClaim) =>
    void run(async () => {
      const out = await data.markPaid(claim.killmailId);
      setOpenId(null);
      return t('srp.officer.results.paid', pilotIsk(out));
    });

  const copy = (claim: SrpClaim) => {
    writeToClipboard(String(claim.amount ?? 0)).then(
      () => flash(claim.killmailId),
      () => setToast(t('srp.officer.results.copyFailed'))
    );
  };

  const ctx: ClaimColumnsContext = {
    t,
    names,
    zone,
    selected: ticked,
    onToggle: (id) =>
      setSelection(ticked.includes(id) ? ticked.filter((x) => x !== id) : [...ticked, id]),
    typed,
    onType: (id, text) => setTyped((prev) => ({ ...prev, [id]: text })),
    onApprove: approve,
    onReject: setRejecting,
    onMarkPaid: markPaid,
    onCopy: copy,
    copiedId: copied,
    busy,
  };

  const columns: DataTableColumn<SrpClaim>[] =
    tab === 'pending'
      ? (phone ? phonePendingColumns : pendingColumns)(ctx)
      : tab === 'owed'
        ? (phone ? phoneOwedColumns : owedColumns)(ctx)
        : (phone ? phoneHistoryColumns : historyColumns)(ctx);

  const bulk = () => {
    const chosen = selectable.filter((c) => ticked.includes(c.killmailId));
    void run(async () => {
      if (tab === 'pending') {
        const out = await data.approveMany(chosen.map((c) => ({ killmailId: c.killmailId })));
        setSelection([]);
        return batchLine('approvedMany', out);
      }
      const out = await data.markPaidMany(chosen.map((c) => c.killmailId));
      setSelection([]);
      return batchLine('paidMany', out);
    });
  };

  const counts = { pending: split.pending.length, owed: split.owed.length };
  const empty = {
    pending: [t('srp.officer.empty.pendingTitle'), t('srp.officer.empty.pendingHint')],
    owed: [t('srp.officer.empty.owedTitle'), t('srp.officer.empty.owedHint')],
    history: [t('srp.officer.empty.historyTitle'), t('srp.officer.empty.historyHint')],
  }[tab];
  const tickedTotal = sumAmounts(selectable.filter((c) => ticked.includes(c.killmailId)));

  return (
    <div className="grid gap-4">
      <p className="text-sm tabular-nums" aria-live="polite">
        <span className="font-semibold">
          {t('srp.officer.summary.pending', { count: counts.pending })}
        </span>
        <span className="text-text-dim"> · </span>
        <span className="font-semibold">
          {t('srp.officer.summary.owed', {
            isk: phone ? formatIskCompact(owed) : formatIsk(owed),
          })}
        </span>
      </p>
      {phone ? (
        <SegmentedControl
          label={t('srp.officer.tabsLabel')}
          fill
          uppercase={false}
          value={tab}
          onChange={changeTab}
          options={[
            { value: 'pending', label: `${t('srp.officer.tabs.pending')} ${counts.pending}` },
            { value: 'owed', label: `${t('srp.officer.tabs.owed')} ${counts.owed}` },
            { value: 'history', label: t('srp.officer.tabs.history') },
          ]}
        />
      ) : (
        <Tabs
          tabsId={tabsId}
          label={t('srp.officer.tabsLabel')}
          value={tab}
          onChange={(id) => changeTab(QUEUE_TABS.find((x) => x === id) ?? 'pending')}
          tabs={[
            {
              id: 'pending',
              label: t('srp.officer.tabs.pending'),
              count: counts.pending,
              countTone: 'warning',
            },
            {
              id: 'owed',
              label: t('srp.officer.tabs.owed'),
              count: counts.owed,
              countTone: 'warning',
            },
            { id: 'history', label: t('srp.officer.tabs.history') },
          ]}
        />
      )}
      <Panel title={t(`srp.officer.title.${tab}`)}>
        <div className="grid gap-3 p-3">
          {tab !== 'history' && (
            <SrpBulkBar
              selected={ticked.length}
              selectable={selectable.length}
              total={tickedTotal}
              onSelectAll={() => setSelection(selectable.map((c) => c.killmailId))}
              onSelectNone={() => setSelection([])}
            >
              <Button
                variant={tab === 'pending' ? 'success' : 'primary'}
                aria-disabled={busy || undefined}
                onClick={busy ? undefined : bulk}
              >
                {t(tab === 'pending' ? 'srp.officer.bulk.approve' : 'srp.officer.bulk.markPaid', {
                  count: ticked.length,
                })}
              </Button>
            </SrpBulkBar>
          )}
          {rows.length === 0 ? (
            <EmptyState title={empty[0]} hint={empty[1]} />
          ) : (
            <DataTable
              label={t(`srp.officer.title.${tab}`)}
              columns={columns}
              rows={rows}
              rowKey={(row) => row.killmailId}
              onRowClick={(row) => setOpenId(row.killmailId)}
              selectedRowKey={openId}
              stackLayout={phone ? 'dense' : 'labelled'}
            />
          )}
        </div>
      </Panel>
      <SrpActivityFeed entries={ready.activity} />
      {open && (
        <SrpClaimDetail
          claim={open}
          ctx={ctx}
          loadAudit={data.claimAudit}
          onClose={() => setOpenId(null)}
          onChangeAmount={setChanging}
        />
      )}
      {rejecting && (
        <RejectClaimDialog
          claim={rejecting}
          names={names}
          onClose={() => setRejecting(null)}
          onReject={async (reason) => {
            const out = await data.reject(rejecting.killmailId, reason);
            setToast(t('srp.officer.results.rejected', { pilot: out.characterName ?? '' }));
            setOpenId(null);
          }}
        />
      )}
      {changing && (
        <ChangeAmountDialog
          claim={changing}
          onClose={() => setChanging(null)}
          onChange={async (amount, reason) => {
            const out = await data.change(changing.killmailId, amount, reason);
            setToast(t('srp.officer.results.changed', pilotIsk(out)));
          }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
