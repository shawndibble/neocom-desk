import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { beginFeederGrantLogin } from '@/app/loginFlow';
import { Button, LoadFailedState, Spinner } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { leaveFeeder, type FeederStatus } from '../taxBook/feederClient';
import { RECONNECT_CODE, requestFeederRate, setFeederPayee } from '../taxBook/feederViewClient';
import { isStale } from '../taxBook/feederViewModel';
import { eveTimeLabel } from '@/engine/corpTaxBook/removalMail';
import { DialogShell } from './BookDialogs';
import { MoonOwnerPrevious } from './MoonOwnerPrevious';
import { MoonOwnerView } from './MoonOwnerView';
import { OwnerStaleBanner } from './OwnerStaleBanner';
import { OwnerStatusStrip } from './OwnerStatusStrip';
import { shortDate } from './moonsFormat';
import { useFeederView } from './useFeederView';

type Owner = Extract<FeederStatus, { status: 'feeder' }>;

/**
 * A moon owner's Moons page once an accounting corporation handles its tax:
 * the owner page (statement, who mined, payments and rate) from the server-built
 * view, the stale-ledger banner with Reconnect, and Leave. A member who is not
 * an officer of the corporation never reaches this (the status read is refused).
 * Leave shows what is still owed before it revokes anything.
 */
export function MoonOwnerPanel({
  owner,
  characterId,
  corporationId,
  canLeave,
  onLeft,
}: {
  owner: Owner;
  characterId: number;
  corporationId: number;
  canLeave: boolean;
  onLeft: () => void;
}) {
  const { t } = useTranslation();
  const { load, reload } = useFeederView(characterId, corporationId);
  const [leaving, setLeaving] = useState(false);
  const [owed, setOwed] = useState<number | null>(owner.owedIsk);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const name = owner.collectorName ?? t('corpTaxBook.moons.owner.anonymous');
  const removing = load.state === 'ready' && load.view?.summary.status === 'pending-removal';

  const reconnect = () => {
    setReconnectError(null);
    beginFeederGrantLogin(characterId, RECONNECT_CODE).catch((e: unknown) =>
      setReconnectError(e instanceof Error ? e.message : String(e))
    );
  };

  let body;
  if (load.state === 'loading')
    body = (
      <div className="flex justify-center p-8">
        <Spinner label={t('common.loading')} />
      </div>
    );
  else if (load.state === 'failed')
    body = (
      <LoadFailedState title={t('corpTaxBook.moons.failed')} hint={load.message} onRetry={reload} />
    );
  else if (load.view === null)
    body = (
      <p className="text-center text-sm text-text-dim">{t('corpTaxBook.moons.owner.waiting')}</p>
    );
  else {
    const { view, access } = load;
    body = (
      <MoonOwnerView
        view={view}
        names={load.names}
        canEdit={access.canEdit}
        onRequestRate={async (pct) => {
          await requestFeederRate(characterId, corporationId, pct);
          reload();
        }}
        characterId={characterId}
        onSetPayee={async (payee) => {
          await setFeederPayee(characterId, corporationId, payee);
          reload();
        }}
        banner={
          <>
            {isStale(view.summary) && view.summary.staleSince !== null && (
              <>
                <OwnerStaleBanner since={view.summary.staleSince} onReconnect={reconnect} />
                {reconnectError && (
                  <p role="alert" className="text-xs text-danger">
                    {reconnectError}
                  </p>
                )}
              </>
            )}
            {view.summary.status === 'pending-removal' && (
              <OwnerStatusStrip
                title={
                  typeof view.summary.removalEffectiveAt === 'number'
                    ? t('corpTaxBook.moons.ownerView.removal.title', {
                        time: eveTimeLabel(view.summary.removalEffectiveAt),
                      })
                    : t('corpTaxBook.moons.ownerView.removal.titleNoTime')
                }
                body={t('corpTaxBook.moons.ownerView.removal.body', {
                  name,
                  date: shortDate(new Date(view.summary.removalStartedAt ?? 0).toISOString()),
                })}
                actions={
                  canLeave ? (
                    <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}>
                      {t('corpTaxBook.moons.ownerView.removal.action')}
                    </Button>
                  ) : undefined
                }
              />
            )}
          </>
        }
      />
    );
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {body}
      {/* Each accounting corporation it left keeps its own history until dismissed (#4621). */}
      {(owner.previousCollectorIds ?? []).map((id) => (
        <MoonOwnerPrevious
          key={id}
          characterId={characterId}
          corporationId={corporationId}
          collectorCorporationId={id}
        />
      ))}
      {canLeave && (
        <div>
          <Button variant="danger" size="sm" onClick={() => setLeaving(true)}>
            {t('corpTaxBook.moons.owner.leave.open')}
          </Button>
        </div>
      )}
      {leaving && (
        <DialogShell
          open
          onClose={() => setLeaving(false)}
          title={t(
            removing
              ? 'corpTaxBook.moons.ownerView.removal.confirmTitle'
              : 'corpTaxBook.moons.owner.leave.title'
          )}
          confirmLabel={t(
            removing
              ? 'corpTaxBook.moons.ownerView.removal.action'
              : 'corpTaxBook.moons.owner.leave.confirm'
          )}
          canConfirm
          danger
          run={async () => {
            const result = await leaveFeeder(characterId, corporationId);
            setOwed(result.owedIsk);
            onLeft();
          }}
        >
          <p>
            {owed === null
              ? t('corpTaxBook.moons.owner.leave.owedUnknown', { name })
              : owed > 0
                ? t('corpTaxBook.moons.owner.leave.owed', {
                    name,
                    isk: formatIsk(owed),
                  })
                : t('corpTaxBook.moons.owner.leave.nothingOwed', { name })}
          </p>
          <p className="mt-2 text-text-dim">
            {removing
              ? t('corpTaxBook.moons.ownerView.removal.confirmBody', { name })
              : t('corpTaxBook.moons.owner.leave.body')}
          </p>
        </DialogShell>
      )}
    </div>
  );
}
