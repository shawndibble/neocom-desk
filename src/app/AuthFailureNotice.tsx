import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, ReauthBanner } from '@/components/ui';
import { useAuthFailure } from '@/stores/authFailure';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginEveLogin } from './loginFlow';

/**
 * Total auth failure → /login, once, centrally.
 *
 * The scope gate covers what is knowable up front; this covers what is not.
 * `ScopeGate` reads the *stored* grant, which is optimistic: revoking access
 * in EVE's third-party application portal leaves the local `TokenRecord`
 * claiming the scope until the next refresh. When that refresh is rejected,
 * nothing in the app works for that Character, so staying put and showing a
 * per-view banner would understate it.
 *
 * Only fires for the active Character — a background refresh failing for some
 * other Character is not a reason to throw this one out of the app. The
 * failure is consumed (`dismiss`) as it redirects, so this happens once and
 * not on every subsequent render.
 */
export function AuthFailureRedirect() {
  const failure = useAuthFailure((state) => state.failure);
  const dismiss = useAuthFailure((state) => state.dismiss);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (failure?.kind !== 'token' || failure.characterId !== activeCharacterId) return;
    // Already there: redirecting would only overwrite `state.from` with
    // '/login', losing the destination this exists to preserve.
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
 * Shell-level note for a *partial* runtime auth failure: one ESI read came
 * back 401/403 while the stored grant still claimed the scope. Rendered once
 * in the shell rather than nine times in nine views, because `esi/cache.ts`
 * already computes the `needsReauth` signal centrally — it only ever lacked a
 * sink.
 *
 * Dismissible on purpose. ESI answers 403 for a structure the Character isn't
 * on the ACL of even when the scope *is* held, and re-authing will not fix
 * that; a prompt the user cannot get rid of would be worse than the silent
 * empty view this replaces. Dismissal, a character switch and a page reload
 * all clear it (the store is session-only).
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
        // Shell-level: renders above a route that may have its own primary
        // button (docs/DESIGN.md §5, one per view).
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
