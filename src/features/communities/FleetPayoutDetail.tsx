import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  NeedsConnection,
  ProgressBar,
  SlideOver,
  Spinner,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { Pill } from '@/components/ui/Pill';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  fleetPayoutProgress,
  holdBackIsk,
  type FleetPayout,
  type FleetShare,
} from '@/engine/communities/fleetPayouts';
import { formatIsk } from '@/lib/isk';
import { loadFleetShares, removeFleetPayout, setFleetShareDone } from './fleetPayoutStore';
import { formatLeft, formatShortAge } from './requestFormat';
import { useMyFleetShare } from './useMyFleetShare';

/** A Member's view of their own Share: ISK, paid state, who the boss is. */
function MemberView({
  payout,
  characterId,
  communityId,
}: {
  payout: FleetPayout;
  characterId: number;
  communityId: string;
}) {
  const { t } = useTranslation();
  const mine = useMyFleetShare(characterId, communityId, payout.id);
  if (mine.status === 'loading') {
    return <Spinner size="sm" label={t('communities.payouts.myShareLoading')} />;
  }
  if (mine.status === 'failed') {
    return (
      <p role="alert" className="text-xs text-danger">
        {t('communities.payouts.myShareFailed')}
      </p>
    );
  }
  if (!mine.share)
    return <p className="text-text-dim">{t('communities.payouts.detail.noShare')}</p>;
  return (
    <div className="space-y-2 rounded-xs border border-line bg-panel-2 px-3 py-3">
      <p className="text-text-dim">
        {t('communities.payouts.detail.yourPilot', { name: mine.share.pilotName })}
      </p>
      <p className="text-lg font-medium tabular-nums">
        {t('communities.payouts.isk', { isk: formatIsk(mine.share.isk) })}
      </p>
      <Pill tone={mine.share.paid ? 'success' : 'neutral'}>
        {t(mine.share.paid ? 'communities.payouts.youPaid' : 'communities.payouts.youUnpaid')}
      </Pill>
    </div>
  );
}

/**
 * One Fleet Payout's side panel. The boss gets every Share with a paid toggle,
 * the progress and Remove payout; a listed Member gets their own Share and
 * the boss's name. The server enforces who may read and write; this only
 * decides what to show.
 */
export function FleetPayoutDetail({
  payout,
  mine,
  now,
  characterId,
  communityId,
  onClose,
  onChanged,
  onRemoved,
}: {
  payout: FleetPayout;
  /** The viewer is the boss. */
  mine: boolean;
  now: number;
  characterId: number;
  communityId: string;
  onClose: () => void;
  /** A Share's paid flag changed: refetch the list's counts. */
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const [shares, setShares] = useState<FleetShare[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const readShares = useCallback(
    () =>
      loadFleetShares(characterId, communityId, payout.id).then(
        (loaded) => {
          setShares(loaded);
          setFailed(false);
        },
        () => setFailed(true)
      ),
    [characterId, communityId, payout.id]
  );
  useEffect(() => {
    if (mine) void readShares();
  }, [mine, readShares]);

  const toggle = async (share: FleetShare, paid: boolean) => {
    setBusyId(share.id);
    setError(null);
    try {
      await setFleetShareDone(characterId, communityId, payout.id, share.id, paid);
      await readShares();
      onChanged();
    } catch {
      setError(t('communities.payouts.detail.setFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const progress = fleetPayoutProgress(payout);
  const paidLabel = t('communities.payouts.paidOf', { paid: progress.paid, total: progress.total });
  const rule = t(
    payout.rule === 'equal'
      ? 'communities.payouts.detail.ruleEqual'
      : 'communities.payouts.detail.ruleWeighted'
  );
  const facts: [string, string][] = [
    [
      t('communities.payouts.detail.total'),
      t('communities.payouts.isk', { isk: formatIsk(payout.totalIsk) }),
    ],
    [
      t('communities.payouts.detail.holdBack', { pct: payout.holdBackPct }),
      t('communities.payouts.isk', {
        isk: formatIsk(holdBackIsk(payout.totalIsk, payout.holdBackPct)),
      }),
    ],
    [t('communities.payouts.detail.rule'), rule],
  ];

  return (
    <SlideOver
      open
      onClose={onClose}
      title={payout.name}
      subtitle={[
        mine
          ? t('communities.payouts.you')
          : t('communities.payouts.boss', { name: payout.ownerName }),
        formatShortAge(now - payout.createdAt, t),
        formatLeft(payout.expiresAt, now, t),
      ].join(' · ')}
    >
      <div className="space-y-3 text-sm">
        {!mine ? (
          <MemberView payout={payout} characterId={characterId} communityId={communityId} />
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-text-dim">{label}</dt>
                  <dd className="text-right tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-1">
              <p className="text-xs text-text-dim">{paidLabel}</p>
              <ProgressBar
                label={paidLabel}
                value={progress.paid}
                max={Math.max(1, progress.total)}
              />
            </div>
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            {failed && (
              <p role="alert" className="text-xs text-danger">
                {t('communities.payouts.detail.loadFailed')}
              </p>
            )}
            {shares === null && !failed && <Spinner size="sm" label={t('communities.loading')} />}
            {shares && (
              <ul
                aria-label={t('communities.payouts.detail.sharesLabel')}
                className="divide-y divide-line rounded-xs border border-line"
              >
                {shares.map((share) => (
                  <li key={share.id} className="flex items-center gap-3 px-3 py-1.5">
                    <label className={touchCheckboxLabelClassName}>
                      <Checkbox
                        aria-label={t('communities.payouts.detail.paidToggle', {
                          name: share.pilotName,
                        })}
                        checked={share.paid}
                        disabled={busyId !== null}
                        onChange={(e) => void toggle(share, e.target.checked)}
                      />
                    </label>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{share.pilotName}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-text-dim">
                        {share.memberUid !== null && (
                          <Pill>{t('communities.payouts.detail.member')}</Pill>
                        )}
                        {share.characterId === null && (
                          <span>{t('communities.payouts.detail.typedName')}</span>
                        )}
                        {payout.rule === 'weighted' && (
                          <span>
                            {t('communities.payouts.detail.weight', { weight: share.weight })}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {t('communities.payouts.isk', { isk: formatIsk(share.isk) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <NeedsConnection>
                <Button size="sm" variant="danger" onClick={() => setRemoving(true)}>
                  {t('communities.payouts.detail.remove')}
                </Button>
              </NeedsConnection>
            </div>
          </>
        )}
      </div>
      <ConfirmDialog
        open={removing}
        title={t('communities.payouts.detail.removeTitle')}
        body={t('communities.payouts.detail.removeBody', { name: payout.name })}
        actionLabel={t('communities.payouts.detail.removeAction')}
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          await removeFleetPayout(characterId, communityId, payout.id);
          onRemoved();
        }}
      />
    </SlideOver>
  );
}
