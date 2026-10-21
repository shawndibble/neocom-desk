import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { beginFeederGrantLogin } from '@/app/loginFlow';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { Button, LoadFailedState, Spinner } from '@/components/ui';
import { leaveFeeder, type FeederSetupStatus } from '../taxBook/feederClient';
import {
  RECONNECT_CODE,
  requestFeederRate,
  setFeederPayee,
  setOwnRefineryLabel,
} from '../taxBook/feederViewClient';
import { isStale, owedOnLeaving } from '../taxBook/feederViewModel';
import { eveTimeLabel } from '@/engine/corpTaxBook/removalMail';
import { feederErrorText } from './feederErrorText';
import { LeaveMoonOwnerDialog } from './LeaveMoonOwnerDialog';
import { MoonOwnerPrevious } from './MoonOwnerPrevious';
import { MoonOwnerView } from './MoonOwnerView';
import { OwnerStaleBanner } from './OwnerStaleBanner';
import { OwnerStatusStrip } from './OwnerStatusStrip';
import { shortDate } from './moonsFormat';
import { canMail, mailPayeeChange } from './payeeChangeMail';
import { useFeederView } from './useFeederView';

type Owner = Extract<FeederSetupStatus, { status: 'feeder' }>;

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
  const grantedScopes = useGrantedScopes();
  const [leaving, setLeaving] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const name = owner.collectorName ?? t('corpTaxBook.moons.owner.anonymous');
  // The server's leave answer carries no balance; the page already loaded has it.
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
    body = (
      <MoonOwnerView
        view={view}
        names={load.names}
        nameOf={load.nameOf}
        canEdit={access.canEdit}
        onSetRefineryLabel={async (structureId, label) => {
          await setOwnRefineryLabel(characterId, corporationId, structureId, label);
          reload();
        }}
        onRequestRate={async (pct) => {
          await requestFeederRate(characterId, corporationId, pct);
          reload();
        }}
        characterId={characterId}
        onSetPayee={async (payee, payeeName) => {
          const out = await setFeederPayee(
            characterId,
            corporationId,
            payee,
            canMail(grantedScopes)
          );
          // After the save, and never awaited: the change does not wait on the mail.
          if (out.changed && out.at !== undefined) {
            const ownName = load.nameOf?.(corporationId) ?? `#${corporationId}`;
            void mailPayeeChange({
              grantedScopes,
              characterId,
              corporationId,
              feederCorporationId: corporationId,
              recipients: out.recipients ?? [],
              changedByName: ownName,
              moonOwnerName: ownName,
              payeeName,
              at: out.at,
            });
          }
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
