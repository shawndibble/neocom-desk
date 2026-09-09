import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addCharacter } from '@/features/character/addCharacter';
import {
  LoginError,
  clearLoginIntent,
  clearLoginRecovery,
  clearRetryBudget,
  type LoginFailureReason,
} from '@/auth/session';
import { beginAddCharacterLogin, retryLastLogin, retryLastLoginOnce } from '@/app/loginFlow';
import { Button, Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * SSO refused rather than the exchange failing — `?error=` on the callback.
 * Carried as a throw so it joins the one failure path, and marked terminal
 * there: the commonest cause is the user pressing Cancel.
 */
class SsoRejection extends Error {
  constructor(readonly code: string) {
    super(`SSO returned ${code}`);
    this.name = 'SsoRejection';
  }
}

/** Which wording the panel shows; `null` while the callback is still working. */
type ErrorKind = LoginFailureReason | 'denied' | 'generic' | null;

const MESSAGE_KEY: Record<Exclude<ErrorKind, null>, string> = {
  'no-login-in-progress': 'callback.errorSpent',
  'state-mismatch': 'callback.errorMismatch',
  denied: 'callback.errorDenied',
  generic: 'callback.errorMessage',
};

/**
 * EVE SSO redirect target. Exchanges the code exactly once — the login inside
 * `addCharacter` consumes the one-time PKCE stash, so a ref guards against
 * React 19 StrictMode running the effect twice.
 *
 * A failure restarts the sign-in once by itself before it is reported at all
 * (issue #649; the decision log has the why). Two rules that are not obvious
 * from the code: the panel is never skipped for a user who already has
 * Characters, since landing them on `/characters` would read as success and
 * hide that the Character they were adding is missing; and a `?error=` from
 * SSO is terminal, because the commonest one is the user pressing Cancel and
 * retrying it bounces them straight back to EVE.
 *
 * The panel never carries the thrown Error's own text, which may hold an
 * ESI/PKCE internal detail.
 */
export function Callback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const state = params.get('state');
    const ssoError = params.get('error');
    Promise.resolve()
      .then(() => {
        if (ssoError) throw new SsoRejection(ssoError);
        if (!code || !state) throw new Error('missing code or state param');
        return addCharacter({ code, state });
      })
      .then(async (character) => {
        clearLoginRecovery();
        // Past this point the Character and its token are in Dexie, so the
        // login has happened; a throw from anything below must not put an
        // error panel over it (`features/character/addCharacter` makes the
        // same trade one layer down).
        try {
          // First login becomes the active character automatically.
          const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
          if (activeCharacterId === null) await setActiveCharacter(character.characterId);
        } catch {
          // A Character nobody has selected yet is worth far less than the
          // session; /characters is where one is picked anyway.
        }
        navigate('/characters', { replace: true });
      })
      .catch(async (err: unknown) => {
        if (err instanceof SsoRejection) {
          clearLoginIntent();
          setErrorKind(err.code === 'access_denied' ? 'denied' : 'generic');
          return;
        }
        if (await retryLastLoginOnce().catch(() => false)) return;
        setErrorKind(err instanceof LoginError ? err.reason : 'generic');
      });
  }, [search, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6 text-text">
      {errorKind === null ? (
        <div className="flex items-center gap-3 text-sm text-text-dim">
          <Spinner size="sm" label={t('common.loading')} />
          {t('callback.completing')}
        </div>
      ) : (
        <Panel title={t('callback.errorTitle')} className="w-full max-w-sm">
          <div role="alert" className="space-y-3">
            <p className="text-sm text-danger">{t(MESSAGE_KEY[errorKind])}</p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                // A user-initiated retry is not one of the automatic ones.
                clearRetryBudget();
                // Add Character only when this tab has no record of what the
                // failed login was for.
                void retryLastLogin()
                  .then((restarted) => (restarted ? undefined : beginAddCharacterLogin()))
                  .catch(() => setErrorKind('generic'));
              }}
            >
              {t('callback.retry')}
            </Button>
          </div>
        </Panel>
      )}
    </main>
  );
}
