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
  const [hasError, setHasError] = useState(false);
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
        return completeLogin({ code, state });
      })
      .then(async (character) => {
        // First login becomes the active character automatically.
        const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
        if (activeCharacterId === null) await setActiveCharacter(character.characterId);
        navigate('/characters', { replace: true });
      })
      .catch(() => {
        // Never surface the thrown Error's message: it may be an ESI/PKCE
        // internal detail, and every UI string routes through i18n.
        setHasError(true);
      });
  }, [search, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6 text-text">
      {!hasError ? (
        <div className="flex items-center gap-3 text-sm text-text-dim">
          <Spinner size="sm" label={t('common.loading')} />
          {t('callback.completing')}
        </div>
      ) : (
        <Panel title={t('callback.errorTitle')} className="w-full max-w-sm">
          <div role="alert" className="space-y-3">
            <p className="text-sm text-danger">{t('callback.errorMessage')}</p>
            <Link to="/login" className="text-sm text-accent hover:underline">
              {t('callback.retry')}
            </Link>
          </div>
        </Panel>
      )}
    </main>
  );
}
