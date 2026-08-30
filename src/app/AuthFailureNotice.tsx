import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, ReauthBanner } from '@/components/ui';
import { useAuthFailure } from '@/stores/authFailure';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginEveLogin } from './loginFlow';

/**
 * Total auth failure → /login, once, centrally. Covers what `ScopeGate` cannot:
 * the stored grant is optimistic, so revoking access in EVE's third-party
 * application portal leaves `TokenRecord` claiming the scope until the next
 * refresh is rejected — at which point nothing works for that Character and a
 * per-view banner would understate it.
 *
 * Active Character only; another Character's background failure is no reason to
 * throw this one out. The failure is consumed as it redirects, so this fires
 * once rather than on every subsequent render.
 */
export function AuthFailureRedirect() {
  const failure = useAuthFailure((state) => state.failure);
  const dismiss = useAuthFailure((state) => state.dismiss);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (failure?.kind !== 'token' || failure.characterId !== activeCharacterId) return;
    // Already there: redirecting would overwrite `state.from` with '/login',
    // losing the destination this exists to preserve.
    if (location.pathname === '/login') return;
    dismiss();
    navigate('/login', {
      replace: true,
      state: { from: `${location.pathname}${location.search}` },
    });
  }, [failure, activeCharacterId, dismiss, navigate, location]);

  return null;
}

/**
 * Shell-level note for a *partial* runtime auth failure: one ESI read came back
 * 401/403 while the stored grant still claimed the scope. Rendered once in the
 * shell because `esi/cache.ts` already computes `needsReauth` centrally — it
 * only ever lacked a sink.
 *
 * Dismissible on purpose: not every 403 is fixable by re-authing (see
 * `ScopeGate`), and a prompt the user cannot get rid of would be worse than the
 * silent empty view this replaces.
 */
export function AuthFailureNotice() {
  const { t } = useTranslation();
  const failure = useAuthFailure((state) => state.failure);
  const dismiss = useAuthFailure((state) => state.dismiss);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  if (failure?.kind !== 'request' || failure.characterId !== activeCharacterId) return null;

  return (
    <div role="status" className="mb-4 rounded-xs border border-warning/40 bg-panel px-3 py-1">
      <ReauthBanner
        title={t('reauth.staleGrantTitle')}
        hint={t('reauth.staleGrantHint')}
        actionLabel={t('reauth.staleGrantAction')}
        onLogin={() => void beginEveLogin()}
        // Renders above a route that may have its own primary button
        // (docs/DESIGN.md §5, one per view).
        variant="ghost"
      />
      <div className="pb-2">
        <Button size="sm" onClick={dismiss}>
          {t('reauth.dismiss')}
        </Button>
      </div>
    </div>
  );
}
