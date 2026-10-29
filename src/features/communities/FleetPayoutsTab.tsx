import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  NeedsConnection,
  Panel,
  Spinner,
  ToastStack,
  useDeferredCommits,
  type DataTableColumn,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import {
  fleetPayoutProgress,
  isExpired,
  mySharesOf,
  type FleetPayout,
} from '@/engine/communities/fleetPayouts';
import { formatIsk } from '@/lib/isk';
import { ComposeFleetPayoutDialog } from './ComposeFleetPayoutDialog';
import { FleetPayoutDetail } from './FleetPayoutDetail';
import { formatShortAge } from './requestFormat';
import { useMyFleetShare } from './useMyFleetShare';
import type { CommunityMember } from './communityStore';

/** One array for "not loaded yet", so the roster effect does not re-run each render. */
const NO_MEMBERS: never[] = [];

/** What a listed Member sees in the status cell: their own Share only. */
function MyShareCell({
  characterId,
  communityId,
  payoutId,
}: {
  characterId: number;
  communityId: string;
  payoutId: string;
}) {
  const { t } = useTranslation();
  const mine = useMyFleetShare(characterId, communityId, payoutId);
  if (mine.status === 'loading') return <span className="text-text-dim">…</span>;
  if (mine.status === 'failed' || !mine.share) {
    return <span className="text-danger">{t('communities.payouts.myShareFailed')}</span>;
  }
  return (
    <span className="block">
      <span className="block tabular-nums">
        {t('communities.payouts.isk', { isk: formatIsk(mine.share.isk) })}
      </span>
      <span className={mine.share.paid ? 'text-success' : 'text-text-dim'}>
        {t(mine.share.paid ? 'communities.payouts.youPaid' : 'communities.payouts.youUnpaid')}
      </span>
    </span>
  );
}

/**
 * The Payouts tab body (issue #4779): the Fleet Payouts the viewer opened as
 * boss (all progress) or is listed on (their own Share only), newest first.
 * A row opens its side panel; New payout opens the compose dialog.
 */
export function FleetPayoutsTab({
  characterId,
  communityId,
  myUid,
  members,
  payouts,
  failed,
  now,
  onReload,
}: {
  characterId: number;
  communityId: string;
  myUid: string;
  members: CommunityMember[] | null;
  /** Null until the first read lands. */
  payouts: FleetPayout[] | null;
  failed: boolean;
  now: number;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  // A removed payout stays hidden until its Undo toast ends and the write lands.
  const pendingRemovals = useDeferredCommits();
  const { hiddenIds } = pendingRemovals;

  const rows = useMemo(() => {
    const listed = new Set(mySharesOf(payouts ?? [], myUid).map((p) => p.id));
    return (payouts ?? []).filter(
      (p) => !hiddenIds.has(p.id) && (p.ownerUid === myUid || listed.has(p.id))
    );
  }, [payouts, myUid, hiddenIds]);

  const columns: DataTableColumn<FleetPayout>[] = [
    {
      id: 'payout',
      header: t('communities.payouts.columns.payout'),
      primary: true,
      render: (payout) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-accent">{payout.name}</span>
          <span className="block truncate text-text-dim">
            {payout.ownerUid === myUid
              ? t('communities.payouts.you')
              : t('communities.payouts.boss', { name: payout.ownerName })}
          </span>
        </span>
      ),
      sortValue: (payout) => payout.name.toLowerCase(),
    },
    {
      id: 'status',
      header: t('communities.payouts.columns.status'),
      className: 'whitespace-nowrap',
      render: (payout) => {
        if (payout.ownerUid !== myUid) {
          return (
            <MyShareCell characterId={characterId} communityId={communityId} payoutId={payout.id} />
          );
        }
        const { paid, total, done } = fleetPayoutProgress(payout);
        if (done) return <Pill tone="success">{t('communities.payouts.done')}</Pill>;
        if (isExpired(payout, now)) return <Pill>{t('communities.payouts.expired')}</Pill>;
        return <span>{t('communities.payouts.paidOf', { paid, total })}</span>;
      },
      sortValue: (payout) => payout.paidCount / Math.max(1, payout.shareCount),
    },
    {
      id: 'age',
      header: t('communities.payouts.columns.age'),
      align: 'right',
      className: 'whitespace-nowrap text-text-dim',
      render: (payout) => formatShortAge(now - payout.createdAt, t),
      sortValue: (payout) => payout.createdAt,
    },
  ];

  const retry = (
    <div className="flex flex-wrap items-center gap-2">
      <p role="alert" className="min-w-0 flex-1 text-xs text-danger">
        {t('communities.payouts.loadFailed')}
      </p>
      <Button size="sm" onClick={onReload}>
        {t('communities.retry')}
      </Button>
    </div>
  );
  if (payouts === null) {
    return <Panel>{failed ? retry : <Spinner size="sm" label={t('communities.loading')} />}</Panel>;
  }

  const newPayout = (
    <NeedsConnection>
      <Button size="sm" variant="primary" onClick={() => setComposing(true)}>
        {t('communities.payouts.new')}
      </Button>
    </NeedsConnection>
  );
  const open = payouts.find((p) => p.id === openId && !hiddenIds.has(p.id)) ?? null;

  return (
    <div className="space-y-3">
      {failed && <Panel>{retry}</Panel>}
      {rows.length > 0 && <div className="flex justify-end">{newPayout}</div>}
      <Panel>
        {rows.length === 0 ? (
          <EmptyState
            title={t('communities.payouts.empty')}
            hint={t('communities.payouts.emptyHint')}
            action={newPayout}
          />
        ) : (
          <DataTable
            label={t('communities.payouts.tableLabel')}
            rows={rows}
            rowKey={(payout) => payout.id}
            columns={columns}
            selectedRowKey={openId}
            onRowClick={(payout) => setOpenId(payout.id)}
            stackLayout="dense"
          />
        )}
      </Panel>
      {open && (
        <FleetPayoutDetail
          payout={open}
          mine={open.ownerUid === myUid}
          now={now}
          characterId={characterId}
          communityId={communityId}
          onClose={() => setOpenId(null)}
          onChanged={onReload}
          onRemove={({ message, commit }) => {
            pendingRemovals.defer({
              id: open.id,
              message,
              commit: async () => {
                await commit();
                onReload();
              },
            });
            setOpenId(null);
          }}
        />
      )}
      <ToastStack
        items={pendingRemovals.items}
        undoLabel={t('communities.payouts.detail.undo')}
        onUndo={pendingRemovals.undo}
        onClose={pendingRemovals.commit}
      />
      {composing && (
        <ComposeFleetPayoutDialog
          characterId={characterId}
          communityId={communityId}
          members={members ?? NO_MEMBERS}
          onClose={() => setComposing(false)}
          onCreated={(payoutId) => {
            setOpenId(payoutId);
            onReload();
          }}
        />
      )}
    </div>
  );
}
