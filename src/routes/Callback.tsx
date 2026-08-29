import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { completeLogin } from '@/auth/session';
import { Panel, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * EVE SSO redirect target. Exchanges the code exactly once — completeLogin
 * consumes the one-time PKCE stash, so a ref guards against React 19
 * StrictMode running the effect twice.
 */
export function Callback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const state = params.get('state');
    Promise.resolve()
      .then(() => {
        if (!code || !state) throw new Error(t('callback.errorTitle'));
        return completeLogin({ code, state });
      })
      .then(async (character) => {
        // First login becomes the active character automatically.
        const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
        if (activeCharacterId === null) await setActiveCharacter(character.characterId);
        navigate('/characters', { replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('callback.errorTitle'));
      });
  }, [search, navigate, t]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6 text-text">
      {error === null ? (
        <div className="flex items-center gap-3 text-sm text-text-dim">
          <Spinner size="sm" label={t('common.loading')} />
          {t('callback.completing')}
        </div>
      ) : (
        <Panel title={t('callback.errorTitle')} className="w-full max-w-sm">
          <div className="space-y-3">
            <p className="text-sm text-danger">{error}</p>
            <Link to="/login" className="text-sm text-accent hover:underline">
              {t('callback.retry')}
            </Link>
          </div>
        </Panel>
      )}
    </main>
  );
}
