import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, LoadFailedState, Spinner, TextInput } from '@/components/ui';
import { beginFeederGrantLogin } from '@/app/loginFlow';
import type { OfficerVerdict } from '../taxBook/bookClient';
import {
  INVITE_PARAM,
  getFeederStatus,
  parseInviteInput,
  type FeederStatus,
} from '../taxBook/feederClient';
import type { FeederGrantCallbackState } from '../taxBook/feederGrant';
import { FeederConsent } from './FeederConsent';
import { MoonOwnerPanel } from './MoonOwnerPanel';
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
}: {
  characterId: number;
  corporationId: number;
  verdict: OfficerVerdict;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [owner, setOwner] = useState<
    | { state: 'loading' }
    | { state: 'failed'; message: string }
    | { state: 'ready'; v: FeederStatus }
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
      (e: unknown) => {
        if (!cancelled)
          setOwner({ state: 'failed', message: e instanceof Error ? e.message : String(e) });
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
    return (
      <LoadFailedState
        title={t('corpTaxBook.moons.failed')}
        hint={owner.message}
        onRetry={reloadOwner}
      />
    );

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

  if (step === 'own')
    return (
      <TurnOnBook
        characterId={characterId}
        corporationId={corporationId}
        verdict={verdict}
        onDone={onDone}
      />
    );
  if (step === 'collect')
    return (
      <TurnOnBook
        collect
        characterId={characterId}
        corporationId={corporationId}
        verdict={verdict}
        onDone={onDone}
      />
    );
  const code = parseInviteInput(paste);
  if (step === 'consent' && code)
    return (
      <FeederConsent
        busy={busy}
        onBack={() => setStep('choices')}
        onContinue={(rate) => {
          setBusy(true);
          beginFeederGrantLogin(characterId, code, rate).catch((e: unknown) => {
            setBusy(false);
            setError(e instanceof Error ? e.message : String(e));
          });
        }}
      />
    );

  const canOwn = verdict.isDirector;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {left && (
        <p role="status" className="text-center text-sm">
          {t('corpTaxBook.moons.setup.left')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ['own', 'own', canOwn],
            ['handled', 'consent', true],
            ['collect', 'collect', canOwn],
          ] as const
        ).map(([key, next, enabled]) => (
          <div
            key={key}
            className="flex flex-col justify-between gap-3 rounded-xs border border-line bg-panel p-4 text-sm"
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                {t(`corpTaxBook.moons.setup.${key}.title`)}
              </h2>
              <p className="text-text-dim">{t(`corpTaxBook.moons.setup.${key}.hint`)}</p>
            </div>
            {key === 'handled' ? (
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="text-xs text-text-dim">
                    {t('corpTaxBook.moons.setup.paste')}
                  </span>
                  <TextInput value={paste} onChange={(e) => setPaste(e.target.value)} />
                </label>
                <Button
                  variant="primary"
                  disabled={parseInviteInput(paste) === null}
                  onClick={() => {
                    setError(null);
                    setStep(next);
                  }}
                >
                  {t('corpTaxBook.moons.setup.handled.action')}
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                disabled={!enabled}
                onClick={() => {
                  setError(null);
                  setStep(next);
                }}
              >
                {t(`corpTaxBook.moons.setup.${key}.action`)}
              </Button>
            )}
          </div>
        ))}
      </div>
      {!canOwn && (
        <p className="text-center text-xs text-text-dim">
          {t('corpTaxBook.moons.off.notDirector')}
        </p>
      )}
    </div>
  );
}
