import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addCharacter } from '@/features/character/addCharacter';
import { LoginError, type LoginFailureReason } from '@/auth/session';
import { beginAddCharacterLogin, retryLastLogin } from '@/app/loginFlow';
import { clearLoginIntent } from '@/auth/session';
import { Button, Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * How many times a failed callback may restart the sign-in by itself.
 *
 * One. The retry leaves for `login.eveonline.com` and comes back to this same
 * route, so an unbudgeted one is a redirect loop between the app and SSO —
 * invisible to the user and impossible to interrupt. Held in `sessionStorage`
 * rather than a ref because the retry is a full page load, which is precisely
 * what a ref would not survive.
 */
const RETRY_KEY = 'neocom.sso.autoRetries';
const MAX_AUTO_RETRIES = 1;

function takeRetryBudget(): boolean {
  try {
    const spent = Number(sessionStorage.getItem(RETRY_KEY) ?? '0');
    if (!(spent < MAX_AUTO_RETRIES)) return false;
    sessionStorage.setItem(RETRY_KEY, String(spent + 1));
    return true;
  } catch {
    // No storage, no way to count — so no automatic retry. Failing closed here
    // costs one manual press; failing open risks the loop above.
    return false;
  }
}

function clearRetryBudget(): void {
  try {
    sessionStorage.removeItem(RETRY_KEY);
  } catch {
    // Budget is per-tab and self-limiting; a stuck value only forgoes a retry.
  }
}

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
 * A failure here is recovered from, not merely reported. #649 arrived as a
 * dead end: a panel whose only control led to `/login`, which bounces straight
 * back to `/characters` for anyone who already has one, so the user could
 * neither see what happened nor get out of it. A failure now restarts the
 * sign-in once by itself, asking for what the original one asked for; only
 * when that is spent does the panel appear, and its button restarts the
 * sign-in directly rather than linking somewhere that cannot.
 *
 * The panel is not skipped for a user who already has Characters. Landing them
 * on `/characters` would hide the fact that the Character they were adding is
 * not there — the failure is the thing they need to see.
 *
 * A `?error=` from SSO is terminal, never retried: the commonest one is the
 * user pressing Cancel, and bouncing them straight back to EVE is the opposite
 * of honouring it.
 *
 * The wording is per failure so the panel says which one happened, and never
 * carries the thrown Error's own text, which may hold an ESI/PKCE internal
 * detail.
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
        clearRetryBudget();
        clearLoginIntent();
        // First login becomes the active character automatically.
        const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
        if (activeCharacterId === null) await setActiveCharacter(character.characterId);
        navigate('/characters', { replace: true });
      })
      .catch(async (err: unknown) => {
        if (err instanceof SsoRejection) {
          clearRetryBudget();
          setErrorKind(err.code === 'access_denied' ? 'denied' : 'generic');
          return;
        }
        if (takeRetryBudget() && (await retryLastLogin())) return;
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
                clearRetryBudget();
                // Falls back to Add Character only when this tab has no record
                // of what the failed login was for.
                void retryLastLogin().then((restarted) => {
                  if (!restarted) return beginAddCharacterLogin();
                });
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
