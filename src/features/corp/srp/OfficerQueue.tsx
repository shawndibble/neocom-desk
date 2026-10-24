/**
 * The officer queue: a summary line, Pending / Owed / History, the
 * claim tables with their per-row and bulk actions, the claim detail and the activity feed. Pure
 * view of what `useSrpQueue` loaded; every change goes through its callables and reloads.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import { SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import {
  Button,
  DataTable,
  EmptyState,
  LoadFailedState,
  Panel,
  SegmentedControl,
  Spinner,
  Tabs,
  Toast,
  type DataTableColumn,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { useActiveCharacter } from '@/stores/activeCharacter';
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
import { OfficerRowMenu } from './OfficerRowMenu';
import { groupByPilot, withMailSummary, type SrpMailClaim } from './srpResultMail';
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
import { useSrpResultMail, type DecidedClaim } from './useSrpResultMail';
import type { SrpQueueData, SrpQueueState } from './useSrpQueue';

type Ready = Extract<SrpQueueState, { status: 'ready' }>;

const COPIED_MS = 2500;
const QUEUE_TABS: readonly QueueTab[] = ['pending', 'owed', 'history'];

/** Whether the row earns a menu: the detail's Change amount exists only for a claim with a figure. */
function claimRowHasMenu(claim: SrpClaim): boolean {
  return (claim.state === 'pending' || claim.state === 'approved') && claim.amount !== null;
}

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
  const [paying, setPaying] = useState<SrpClaim | null>(null);
  const selfCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mailMissing, setMailMissing] = useState(false);
  const mailResult = useSrpResultMail();

  const split = useMemo(() => splitClaims(ready.claims), [ready.claims]);
  const history = ready.history;
  const closed = useMemo(
    () => (history.status === 'ready' ? splitClaims(history.claims).history : []),
    [history]
  );
  const rows = tab === 'pending' ? split.pending : tab === 'owed' ? split.owed : closed;
  const selectable = tab === 'pending' ? rows.filter(canBulkApprove) : tab === 'owed' ? rows : [];
  // Ticks belong to the rows they were made on: a claim another officer closed drops off.
  const ticked = pruneSelection(selection, selectable);
  const owed = sumAmounts(split.owed);
  const open = [...ready.claims, ...closed].find((c) => c.killmailId === openId) ?? null;

  // History is read the first time its tab opens, not with the queue.
  const loadHistory = data.loadHistory;
  useEffect(() => {
    if (tab === 'history' && history.status === 'idle') loadHistory();
  }, [tab, history.status, loadHistory]);

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

  /** Mails the pilots the result, best effort, and returns the result line with what happened to the mail. */
  const withMail = async (
    head: string,
    kind: 'approved' | 'rejected',
    decided: DecidedClaim[]
  ): Promise<string> => {
    const mail = await mailResult(kind, decided);
    // A run with no pilots (every claim refused) says nothing about the grant: leave the note be.
    if (groupByPilot(decided).length > 0) setMailMissing(mail.missingScope);
    return withMailSummary(t, head, mail);
  };

  const decidedFrom = (o: SrpClaimOutcome, extra: Partial<SrpMailClaim> = {}): DecidedClaim => {
    const claim = ready.claims.find((c) => c.killmailId === o.killmailId);
    return {
      characterId: o.characterId,
      characterName: o.characterName,
      claim: {
        killmailId: o.killmailId,
        hull: claim ? names.hull(claim.hullTypeId) : t('srp.officer.mail.hullFallback'),
        amount: o.amount ?? claim?.amount ?? 0,
        ...extra,
      },
    };
  };

  const approve = (claim: SrpClaim) => {
    const amount = approveAmount(claim, typed[claim.killmailId]);
    if (amount === null) return;
    void run(async () => {
      const out = await data.approve({
        killmailId: claim.killmailId,
        expectedAmount: claim.amount,
        ...(claim.amount === null ? { amount } : {}),
      });
      setOpenId(null);
      return withMail(t('srp.officer.results.approved', pilotIsk(out)), 'approved', [
        decidedFrom(out),
      ]);
    });
  };

  const markPaid = (claim: SrpClaim) =>
    run(async () => {
      const out = await data.markPaid({
        killmailId: claim.killmailId,
        expectedAmount: claim.amount,
      });
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
    onMarkPaid: setPaying,
    selfCharacterId,
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
        const out = await data.approveMany(
          chosen.map((c) => ({ killmailId: c.killmailId, expectedAmount: c.amount }))
        );
        setSelection([]);
        const decided = out.results.flatMap((r) => (r.ok ? [decidedFrom(r)] : []));
        return withMail(batchLine('approvedMany', out), 'approved', decided);
      }
      const out = await data.markPaidMany(
        chosen.map((c) => ({ killmailId: c.killmailId, expectedAmount: c.amount }))
      );
      setSelection([]);
      return batchLine('paidMany', out);
    });
  };

  const counts = { pending: split.pending.length, owed: split.owed.length };
  const tabItems: { id: QueueTab; label: string; count?: number }[] = [
    { id: 'pending', label: t('srp.officer.tabs.pending'), count: counts.pending },
    { id: 'owed', label: t('srp.officer.tabs.owed'), count: counts.owed },
    { id: 'history', label: t('srp.officer.tabs.history') },
  ];
  const empty = {
    pending: [t('srp.officer.empty.pendingTitle'), t('srp.officer.empty.pendingHint')],
    owed: [t('srp.officer.empty.owedTitle'), t('srp.officer.empty.owedHint')],
    history: [t('srp.officer.empty.historyTitle'), t('srp.officer.empty.historyHint')],
  }[tab];
  const tickedTotal = sumAmounts(selectable.filter((c) => ticked.includes(c.killmailId)));

  return (
    <div className="grid gap-4">
      {mailMissing && (
        <GrantNote
          endpoints={SEND_MAIL_ENDPOINTS}
          title={t('srp.officer.mail.grantTitle')}
          hint={t('srp.officer.mail.grantHint')}
          actionLabel={t('srp.officer.mail.grantAction')}
        />
      )}
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
          options={tabItems.map(({ id, label, count }) => ({
            value: id,
            label: count === undefined ? label : t('srp.officer.phoneTab', { label, count }),
          }))}
        />
      ) : (
        <Tabs
          tabsId={tabsId}
          label={t('srp.officer.tabsLabel')}
          value={tab}
          onChange={(id) => changeTab(QUEUE_TABS.find((x) => x === id) ?? 'pending')}
          tabs={tabItems.map(({ id, label, count }) => ({
            id,
            label,
            ...(count !== undefined && { count, countTone: 'warning' as const }),
          }))}
        />
      )}
      <Panel title={t(`srp.officer.title.${tab}`)} padded={false}>
        <div className="grid gap-3">
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
          {tab === 'history' && history.status !== 'ready' ? (
            history.status === 'failed' ? (
              <LoadFailedState
                title={t('srp.officer.history.loadFailed')}
                onRetry={data.loadHistory}
              />
            ) : (
              <Spinner label={t('common.loading')} />
            )
          ) : rows.length === 0 ? (
            <EmptyState title={empty[0]} hint={empty[1]} />
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                label={t(`srp.officer.title.${tab}`)}
                columns={columns}
                rows={rows}
                rowKey={(row) => row.killmailId}
                onRowClick={(row) => setOpenId(row.killmailId)}
                selectedRowKey={openId}
                stackLayout={phone ? 'dense' : 'labelled'}
                // Phone: tick box, title, amount and ⋮ share line one (Hauling's card).
                className="dt-dense-tight"
                rowContextMenu={
                  tab === 'history'
                    ? undefined
                    : (row, tr) =>
                        claimRowHasMenu(row) ? (
                          <OfficerRowMenu claim={row} onChangeAmount={setChanging}>
                            {tr}
                          </OfficerRowMenu>
                        ) : (
                          tr
                        )
                }
                rowMoreActions={tab !== 'history'}
              />
            </div>
          )}
          {tab === 'history' && history.status === 'ready' && history.more && (
            <div className="px-3 pb-3">
              <Button onClick={data.loadOlderHistory}>{t('srp.officer.history.loadOlder')}</Button>
            </div>
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
            setOpenId(null);
            setToast(
              await withMail(
                t('srp.officer.results.rejected', { pilot: out.characterName ?? '' }),
                'rejected',
                [decidedFrom(out, { reason: out.reason ?? reason })]
              )
            );
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
      <ConfirmDialog
        open={paying !== null}
        title={t('srp.officer.markPaid.title')}
        body={
          paying
            ? t('srp.officer.markPaid.body', {
                isk: formatIsk(paying.amount ?? 0),
                pilot: paying.characterName,
              })
            : ''
        }
        actionLabel={t('srp.officer.actions.markPaid')}
        danger={false}
        cancelLabel={t('common.cancel')}
        onConfirm={async () => {
          // A refusal becomes the toast (`run`), so the dialog always closes.
          if (paying) await markPaid(paying);
        }}
        onClose={() => setPaying(null)}
      />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
