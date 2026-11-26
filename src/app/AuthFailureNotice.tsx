import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Button, LiveStatus, NeedsConnection, ReauthBanner } from '@/components/ui';
import { useAuthFailure, useNeedsLogin, type AuthFailure } from '@/stores/authFailure';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { permissionsForEndpoints } from '@/esi/registry';
import { beginEveLogin } from './loginFlow';
import { pageOwnsReauth } from './pageOwnsReauth';
import { useSlotCovers } from './reauthSlots';

export function AuthFailureRedirect() {
  const failure = useAuthFailure((state) => state.failure);
  const dismiss = useAuthFailure((state) => state.dismiss);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (failure?.kind !== 'token' || failure.characterId !== activeCharacterId) return;
    dismiss();
    if (location.pathname === '/characters' || location.pathname === '/login') return;
    navigate('/characters', { replace: true });
  }, [failure, activeCharacterId, dismiss, navigate, location]);

  return null;
}

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
    <div className="rounded-xs border border-warning/40 bg-panel px-3 py-1">
      <LiveStatus>{t('reauth.loginTitle', { character: character.name })}</LiveStatus>
      <ReauthBanner
        title={t('reauth.loginTitle', { character: character.name })}
        hint={t('reauth.refusedHint')}
        actionLabel={t('reauth.loginAction')}
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

export function AuthFailureNotice() {
  const { t } = useTranslation();
  const failure = useAuthFailure((state) => state.failure);
  const dismiss = useAuthFailure((state) => state.dismiss);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const character = useLiveQuery(
    () => (activeCharacterId ? db.characters.get(activeCharacterId) : undefined),
    [activeCharacterId]
  );

  const { pathname } = useLocation();
  const pageCovers = useSlotCovers(failure?.characterId);

  const shown =
    failure?.kind === 'request' &&
    failure.characterId === activeCharacterId &&
    !pageCovers &&
    !pageOwnsReauth(pathname, failure.endpointId)
      ? failure
      : null;
  const name = character?.name ?? t('reauth.unknownCharacter');
  const title = t('reauth.loginTitle', { character: name });
  const role =
    failure?.kind === 'role' && failure.characterId === activeCharacterId
      ? t('reauth.roleTitle', { character: name })
      : null;

  return (
    <>
      <LiveStatus>
        {shown && `${title}. ${t('reauth.refusedHint')}`}
        {role && `${role}. ${t('reauth.roleHint')}`}
      </LiveStatus>
      {shown && <AuthFailureBlock failure={shown} title={title} onDismiss={dismiss} />}
      {role && (
        <div
          data-status-item
          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-xs"
        >
          <p className="min-w-0 flex-1">
            <span className="font-semibold text-warning">{role}</span>
            <span className="text-text-dim"> {t('reauth.roleHint')}</span>
          </p>
          <Button size="sm" onClick={dismiss}>
            {t('reauth.dismiss')}
          </Button>
        </div>
      )}
    </>
  );
}

function AuthFailureBlock({
  failure,
  title,
  onDismiss,
}: {
  failure: Pick<AuthFailure, 'characterId' | 'endpointId'>;
  title: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-status-item
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5"
    >
      <p className="min-w-48 flex-1 text-xs">
        <span className="font-semibold text-warning">{title}</span>
        <span className="text-text-dim"> {t('reauth.refusedHint')}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <NeedsConnection>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void beginEveLogin({
                characterId: failure.characterId,
                groups: failure.endpointId ? permissionsForEndpoints([failure.endpointId]) : [],
              })
            }
          >
            {t('reauth.loginAction')}
          </Button>
        </NeedsConnection>
        <Button size="sm" onClick={onDismiss}>
          {t('reauth.dismiss')}
        </Button>
      </div>
    </div>
  );
}
