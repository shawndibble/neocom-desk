import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addCharacter } from '@/features/character/addCharacter';
import { LoginError, type LoginFailureReason } from '@/auth/session';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { db } from '@/db';
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

/** Which wording the panel shows; `null` while the callback is still working. */
type ErrorKind = LoginFailureReason | 'generic' | null;

const MESSAGE_KEY: Record<Exclude<ErrorKind, null>, string> = {
  'no-login-in-progress': 'callback.errorSpent',
  'state-mismatch': 'callback.errorMismatch',
  generic: 'callback.errorMessage',
};

/**
 * EVE SSO redirect target. Exchanges the code exactly once — the login inside
 * `addCharacter` consumes the one-time PKCE stash, so a ref guards against
 * React 19 StrictMode running the effect twice.
 *
 * A failure here is recovered from, not reported. #649 arrived as a dead end:
 * a panel whose only control led to `/login`, which bounces straight back to
 * `/characters` for anyone who already has one, so the user could neither see
 * what happened nor get out of it. In order, a failure now: restarts the
 * sign-in once by itself; failing that, falls back to the Characters list if
 * this device has any; and only with neither available shows the panel — which
 * now restarts the sign-in directly instead of linking somewhere that cannot.
 *
 * The wording is per failure so the panel says which of the three happened,
 * and never carries the thrown Error's own text, which may hold an ESI/PKCE
 * internal detail.
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
    Promise.resolve()
      .then(() => {
        if (!code || !state) throw new Error('missing code or state param');
        return addCharacter({ code, state });
      })
      .then(async (character) => {
        clearRetryBudget();
        // First login becomes the active character automatically.
        const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
        if (activeCharacterId === null) await setActiveCharacter(character.characterId);
        navigate('/characters', { replace: true });
      })
      .catch(async (err: unknown) => {
        if (takeRetryBudget()) {
          await beginAddCharacterLogin();
          return;
        }
        // `count` before the panel: a Character on the device means the list is
        // a better answer than an error, whatever went wrong with this grant.
        const known = await db.characters.count().catch(() => 0);
        if (known > 0) {
          navigate('/characters', { replace: true });
          return;
        }
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
                void beginAddCharacterLogin();
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
