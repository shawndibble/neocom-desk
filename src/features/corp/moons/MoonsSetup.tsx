import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoadFailedState, Spinner } from '@/components/ui';
import { beginFeederGrantLogin } from '@/app/loginFlow';
import type { OfficerVerdict } from '../taxBook/bookClient';
import {
  INVITE_PARAM,
  getFeederStatus,
  parseInviteInput,
  type FeederSetupStatus,
} from '../taxBook/feederClient';
import type { FeederGrantCallbackState } from '../taxBook/feederGrant';
import { feederErrorText } from './feederErrorText';
import { FeederConsent } from './FeederConsent';
import { MoonsChoices } from './MoonsChoices';
import { MoonOwnerPanel } from './MoonOwnerPanel';
import { MoonOwnerPrevious } from './MoonOwnerPrevious';
import { TurnOnBook } from './TurnOnBook';

type Step = 'choices' | 'own' | 'collect' | 'consent';

/**
 * The Moons page of a corporation with no book: three choices side by side (run
 * its own book, let an accounting corporation handle it, collect for others), a
 * pasted invite link or code, or, once an accounting corporation handles it, the
 * moon owner's page. A corporation is a moon owner or has its own book, never
 * both, so only one of those is ever offered.
 */
export function MoonsSetup({
  characterId,
  corporationId,
  verdict,
  onDone,
  onTurnedOn,
}: {
  characterId: number;
  corporationId: number;
  verdict: OfficerVerdict;
  onDone: () => void;
  /** Their own book was just turned on: the page runs its first sync. */
  onTurnedOn?: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [owner, setOwner] = useState<
    { state: 'loading' } | { state: 'failed' } | { state: 'ready'; v: FeederSetupStatus }
  >({ state: 'loading' });
  const invited = new URLSearchParams(location.search).get(INVITE_PARAM);
  const [step, setStep] = useState<Step>(invited ? 'consent' : 'choices');
  const [paste, setPaste] = useState(invited ?? '');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The grant round trip lands back here with its result as router state: keep it once, then drop it.
  const [grant] = useState(
    () => (location.state as Partial<FeederGrantCallbackState> | null)?.feederGrant
  );
  const [error, setError] = useState<string | null>(() =>
    grant?.status === 'failed'
      ? t(`corpTaxBook.moons.setup.failed.${grant.reason ?? 'generic'}`, {
          defaultValue: t('corpTaxBook.moons.setup.failed.generic'),
        })
      : null
  );
  useEffect(() => {
    if (grant) navigate(location.pathname, { replace: true, state: null });
    // Only on arrival: `grant` is fixed for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    getFeederStatus(characterId, corporationId).then(
      (v) => {
        if (!cancelled) setOwner({ state: 'ready', v });
      },
      () => {
        if (!cancelled) setOwner({ state: 'failed' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, attempt]);

  const reloadOwner = useCallback(() => {
    setOwner({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  if (owner.state === 'loading')
    return (
      <div className="flex justify-center p-8">
        <Spinner label={t('common.loading')} />
      </div>
    );
  if (owner.state === 'failed')
    return <LoadFailedState title={t('corpTaxBook.moons.failed')} onRetry={reloadOwner} />;

  const status = owner.v;
  if (
    status.status === 'feeder' &&
    !left &&
    ['active', 'pending-removal', 'disconnected'].includes(status.feederStatus)
  ) {
    return (
      <>
        {grant?.status === 'on' && (
          <p role="status" className="mb-3 text-center text-sm">
            {t('corpTaxBook.moons.setup.granted', { name: grant.name })}
          </p>
        )}
        <MoonOwnerPanel
          owner={status}
          characterId={characterId}
          corporationId={corporationId}
          canLeave={status.isHolder || verdict.isCeo || verdict.isDirector}
          onLeft={() => {
            setLeft(true);
            setStep('choices');
          }}
        />
      </>
    );
  }

  const earliestStart = status.status === 'none' ? status.ownBookFrom : undefined;
  if (step === 'own')
    return (
      <TurnOnBook
        earliestStart={earliestStart}
        characterId={characterId}
        corporationId={corporationId}
        verdict={verdict}
        onDone={onDone}
        onTurnedOn={onTurnedOn}
        onBack={() => setStep('choices')}
      />
    );
  if (step === 'collect')
    return (
      <TurnOnBook
        collect
        earliestStart={earliestStart}
        characterId={characterId}
        corporationId={corporationId}
        verdict={verdict}
        onDone={onDone}
        onBack={() => setStep('choices')}
      />
    );
  const code = parseInviteInput(paste);
  if (step === 'consent' && code)
    return (
      <FeederConsent
        characterId={characterId}
        code={code}
        busy={busy}
        error={error}
        onBack={() => setStep('choices')}
        onContinue={(rate) => {
          setBusy(true);
          beginFeederGrantLogin(characterId, code, rate).catch((e: unknown) => {
            setBusy(false);
            setError(feederErrorText(t, e));
          });
        }}
      />
    );

  const choices = (
    <MoonsChoices
      canOwn={verdict.isDirector}
      left={left}
      error={error}
      paste={paste}
      onPaste={setPaste}
      onChoose={(next) => {
        setError(null);
        setStep(next);
      }}
    />
  );
  // A corporation an accounting corporation handled before sees that history above the choice;
  // any it left before that keep theirs below (#4621).
  const older = status.status === 'none' ? (status.previousCollectorIds ?? []).slice(1) : [];
  return (
    <>
      <MoonOwnerPrevious key={String(left)} characterId={characterId} corporationId={corporationId}>
        {choices}
      </MoonOwnerPrevious>
      {older.map((id) => (
        <MoonOwnerPrevious
          key={`${String(left)}-${id}`}
          characterId={characterId}
          corporationId={corporationId}
          collectorCorporationId={id}
        />
      ))}
    </>
  );
}
