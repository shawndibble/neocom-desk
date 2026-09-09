import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addCharacter } from '@/features/character/addCharacter';
import { LoginError, type LoginFailureReason } from '@/auth/session';
import { Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';

/** Which wording the error panel shows; `null` while the login is still running. */
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
 * The ref only spans one mount, though, and a second *landing* on this URL is
 * a fresh one — the shape issue #649 hit by switching user on EVE's login
 * page. `completeLogin` answers that by replaying the completed login, so the
 * panel below is reached only by a login that genuinely did not happen.
 *
 * Which of the three ways it did not happen is worth saying out loud: the
 * single generic message made a spent link, a mismatched state and a rejected
 * code indistinguishable in a bug report. The messages stay free of the
 * thrown Error's own text, which may carry an ESI/PKCE internal detail.
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
        // First login becomes the active character automatically.
        const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
        if (activeCharacterId === null) await setActiveCharacter(character.characterId);
        navigate('/characters', { replace: true });
      })
      .catch((err: unknown) => {
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
            <Link to="/login" className="text-sm text-accent hover:underline">
              {t('callback.retry')}
            </Link>
          </div>
        </Panel>
      )}
    </main>
  );
}
