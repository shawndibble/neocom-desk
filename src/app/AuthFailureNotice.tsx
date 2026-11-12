import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Button, LiveStatus, ReauthBanner } from '@/components/ui';
import { useAuthFailure, useNeedsLogin, type AuthFailure } from '@/stores/authFailure';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { permissionsForEndpoints } from '@/esi/registry';
import { beginEveLogin } from './loginFlow';
import { pageOwnsReauth } from './pageOwnsReauth';

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
    // `reportTokenFailure` already left the needs-sign-in mark, which
    // outlives this consumed failure, so Characters can say why the player
    // landed there.
    dismiss();
    // Straight to Characters, skipping the /login hop that bounced there
    // anyway. The old `state.from` is dropped: re-login lands on Characters.
    if (location.pathname === '/characters' || location.pathname === '/login') return;
    navigate('/characters', { replace: true });
  }, [failure, activeCharacterId, dismiss, navigate, location]);

  return null;
}

/**
 * Notice on Characters for the active Character when its login is dead — the
 * redirect above is what brought the player here, and this says why. Every
 * other marked Character carries the state on its own row instead
 * (`NeedsLoginAction`), so a dozen dead alts never stack a dozen banners.
 * Dismissing hides it for this visit only: the mark itself stays until the
 * Character signs in again.
 */
export function NeedsLoginNotice() {
  const { t } = useTranslation();
  const needsLogin = useNeedsLogin((state) => state.value);
  useHydratedStore(useNeedsLogin);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const shownId =
    activeCharacterId !== null &&
    activeCharacterId !== dismissedId &&
    needsLogin.includes(activeCharacterId)
      ? activeCharacterId
      : null;
  const character = useLiveQuery(
    () => (shownId === null ? undefined : db.characters.get(shownId)),
    [shownId]
  );

  if (shownId === null || character === undefined) return null;

  return (
    <div role="status" className="rounded-xs border border-warning/40 bg-panel px-3 py-1">
      <ReauthBanner
        title={t('reauth.needsLoginTitle', { character: character.name })}
        hint={t('reauth.needsLoginHint', { character: character.name })}
        actionLabel={t('reauth.staleGrantAction')}
        onLogin={() => void beginEveLogin({ characterId: character.characterId })}
      />
      <div className="pb-2">
        <Button size="sm" onClick={() => setDismissedId(character.characterId)}>
          {t('reauth.dismiss')}
        </Button>
      </div>
    </div>
  );
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
  // Only ever looked up for the active Character (the guard below), so this
  // never has to reconcile with which Character a background failure was for.
  const character = useLiveQuery(
    () => (activeCharacterId ? db.characters.get(activeCharacterId) : undefined),
    [activeCharacterId]
  );

  const { pathname } = useLocation();

  // The page shows its own banner for this refusal; two login buttons would stack.
  const shown =
    failure?.kind === 'request' &&
    failure.characterId === activeCharacterId &&
    !pageOwnsReauth(pathname, failure.endpointId)
      ? failure
      : null;
  const hint = character
    ? t('reauth.staleGrantHintNamed', { character: character.name })
    : t('reauth.staleGrantHint');

  // The region stays mounted (empty) and fills when the notice appears. The
  // visible block holds buttons, so it is neither `aria-hidden` nor a live region.
  return (
    <>
      <LiveStatus>{shown && `${t('reauth.staleGrantTitle')}. ${hint}`}</LiveStatus>
      {shown && <AuthFailureBlock failure={shown} hint={hint} onDismiss={dismiss} />}
    </>
  );
}

function AuthFailureBlock({
  failure,
  hint,
  onDismiss,
}: {
  failure: Pick<AuthFailure, 'characterId' | 'endpointId'>;
  hint: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 rounded-xs border border-warning/40 bg-panel px-3 py-1">
      <ReauthBanner
        title={t('reauth.staleGrantTitle')}
        hint={hint}
        actionLabel={t('reauth.staleGrantAction')}
        // The Permission behind the refused request, when it is known. A
        // refusal for a scope the grant never held (a mail send on a token that
        // predates `send_mail`) is only fixed by asking for it; a stale grant
        // is unaffected, since the stored scopes are unioned in regardless.
        onLogin={() =>
          void beginEveLogin({
            characterId: failure.characterId,
            groups: failure.endpointId ? permissionsForEndpoints([failure.endpointId]) : [],
          })
        }
        // Renders above a route that may have its own primary button
        // (docs/DESIGN.md §5, one per view).
        variant="ghost"
      />
      <div className="pb-2">
        <Button size="sm" onClick={onDismiss}>
          {t('reauth.dismiss')}
        </Button>
      </div>
    </div>
  );
}
