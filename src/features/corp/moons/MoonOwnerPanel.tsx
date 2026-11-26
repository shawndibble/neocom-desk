import { useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { beginFeederGrantLogin } from '@/app/loginFlow';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { Button, LoadFailedState, Spinner } from '@/components/ui';
import { leaveFeeder, type FeederSetupStatus } from '../taxBook/feederClient';
import {
  RECONNECT_CODE,
  disputeFeederPayout,
  requestFeederRate,
  setFeederPayee,
  setFeederPopSharing,
  setOwnRefineryLabel,
} from '../taxBook/feederViewClient';
import { isStale, owedOnLeaving } from '../taxBook/feederViewModel';
import { feederErrorText } from './feederErrorText';
import { LeaveMoonOwnerDialog } from './LeaveMoonOwnerDialog';
import { MoonOwnerPrevious } from './MoonOwnerPrevious';
import { MoonOwnerView } from './MoonOwnerView';
import { OwnerStaleBanner } from './OwnerStaleBanner';
import { daysUntilOreLost, staleLedgerClock } from '@/engine/corpTaxBook/feederHealth';
import { GrantAgainBanner } from './GrantAgainBanner';
import { grantLack } from './grantLack';
import { OwnerStatusStrip } from './OwnerStatusStrip';
import { atDate, dateTimeAt } from './moonsFormat';
import { enqueuePayeeChangeMail } from '@/features/corpTaxBook/mailQueue';
import { canSendMail, queueOfficerMail } from '@/features/corpTaxBook/officerMail';
import { useFeederView } from './useFeederView';

type Owner = Extract<FeederSetupStatus, { status: 'feeder' }>;

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
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { load, reload } = useFeederView(characterId, corporationId);
  const grantedScopes = useGrantedScopes();
  const [leaving, setLeaving] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const name = owner.collectorName ?? t('corpTaxBook.moons.owner.anonymous');
  const owed =
    load.state === 'ready' && load.view !== null ? owedOnLeaving(load.view.summary) : null;
  const removing = load.state === 'ready' && load.view?.summary.status === 'pending-removal';

  const reconnect = () => {
    setReconnectError(null);
    beginFeederGrantLogin(characterId, RECONNECT_CODE).catch((e: unknown) =>
      setReconnectError(feederErrorText(t, e))
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
    const lacks = grantLack(view.summary);
    body = (
      <MoonOwnerView
        view={view}
        names={load.names}
        nameOf={load.nameOf}
        typeName={load.typeName}
        canEdit={access.canEdit}
        onSetRefineryLabel={async (structureId, label) => {
          await setOwnRefineryLabel(characterId, corporationId, structureId, label);
          reload();
        }}
        onRequestRate={async (pct) => {
          await requestFeederRate(characterId, corporationId, pct);
          reload();
        }}
        onDisputePayout={async (payoutId, disputed) => {
          await disputeFeederPayout(characterId, corporationId, payoutId, disputed);
          reload();
        }}
        onSetPopSharing={async (share) => {
          await setFeederPopSharing(characterId, corporationId, share);
          reload();
        }}
        characterId={characterId}
        onSetPayee={async (payee, payeeName) => {
          const out = await setFeederPayee(
            characterId,
            corporationId,
            payee,
            canSendMail(grantedScopes)
          );
          if (out.changed && out.at !== undefined) {
            const ownName = load.nameOf?.(corporationId) ?? `#${corporationId}`;
            const at = out.at;
            void queueOfficerMail({
              senderCharacterId: characterId,
              grantedScopes,
              recipients: out.recipients ?? [],
              enqueue: (recipients) =>
                enqueuePayeeChangeMail({
                  corporationId,
                  senderCharacterId: characterId,
                  feederCorporationId: corporationId,
                  at,
                  changedByName: ownName,
                  moonOwnerName: ownName,
                  payeeName,
                  recipients,
                }),
            });
          }
          reload();
        }}
        banner={
          <>
            {isStale(view.summary) && view.summary.staleSince !== null && (
              <>
                <OwnerStaleBanner
                  since={view.summary.staleSince}
                  daysLeft={daysUntilOreLost(
                    staleLedgerClock(view.summary.staleSince, view.summary.lastReadWellAt),
                    new Date().toISOString()
                  )}
                  onReconnect={reconnect}
                />
                {reconnectError && <InlineError>{reconnectError}</InlineError>}
              </>
            )}
            {lacks !== null && view.summary.status === 'active' && !isStale(view.summary) && (
              <>
                <GrantAgainBanner lacks={lacks} onGrant={reconnect} />
                {reconnectError && <InlineError>{reconnectError}</InlineError>}
              </>
            )}
            {view.summary.status === 'pending-removal' && (
              <OwnerStatusStrip
                title={
                  typeof view.summary.removalEffectiveAt === 'number'
                    ? t('corpTaxBook.moons.ownerView.removal.title', {
                        time: dateTimeAt(view.summary.removalEffectiveAt, zone),
                      })
                    : t('corpTaxBook.moons.ownerView.removal.titleNoTime')
                }
                body={t('corpTaxBook.moons.ownerView.removal.body', {
                  name,
                  date: atDate(view.summary.removalStartedAt ?? 0, zone),
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
    <div className="mx-auto max-w-page space-y-4">
      {body}
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
        <LeaveMoonOwnerDialog
          name={name}
          owed={owed}
          removing={removing}
          onClose={() => setLeaving(false)}
          onLeave={async () => {
            await leaveFeeder(characterId, corporationId);
            onLeft();
          }}
        />
      )}
    </div>
  );
}
