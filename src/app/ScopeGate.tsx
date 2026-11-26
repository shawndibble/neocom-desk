import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { PERMISSIONS, type ScopeGroup } from '@/esi/registry';
import { permissionsForScopes } from './missingPermissions';
import { useReauthSlot } from './reauthSlots';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useViewedCharacterId } from '@/features/character/viewedCharacter';
import { ReauthBanner } from '@/components/ui';
import { pageTitleFor } from './documentTitle';
import { beginEveLogin } from './loginFlow';
import { useGrantedScopes } from './useGrantedScopes';
import {
  isGatedRoute,
  missingScopesForRoute,
  permissionsForRoute,
  type AppRoutePath,
} from './routeScopes';

interface ScopeGateProps {
  path: AppRoutePath;
  children: ReactNode;
}

export function ScopeGate({ path, children }: ScopeGateProps) {
  const { t } = useTranslation();
  const gated = isGatedRoute(path);
  const granted = useGrantedScopes();
  const viewingOther = useViewedCharacterId() !== undefined && path === '/assets';
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  if (!gated || granted === undefined || viewingOther || activeCharacterId === null) {
    return <>{children}</>;
  }
  const missingScopes = missingScopesForRoute(path, granted);
  if (missingScopes.length === 0) return <>{children}</>;

  return (
    <>
      <h1 className="sr-only">{pageTitleFor(path, t)}</h1>
      <LockedRouteBanner
        path={path}
        characterId={activeCharacterId}
        missing={permissionsForScopes(missingScopes)}
      />
    </>
  );
}

function LockedRouteBanner({
  path,
  characterId,
  missing,
}: {
  path: AppRoutePath;
  characterId: number;
  missing: readonly ScopeGroup[];
}) {
  const { t } = useTranslation();
  useReauthSlot(characterId, 'page', []);
  const read = useLiveQuery(
    async () => ({ characterId, name: (await db.characters.get(characterId))?.name }),
    [characterId]
  );
  if (read?.characterId !== characterId) return null;
  const character = read.name ?? t('reauth.unknownCharacter');
  return (
    <ReauthBanner
      title={
        missing.length > 0
          ? t('reauth.missingTitle', {
              character,
              permissions: missing.map((group) => t(PERMISSIONS[group].labelKey)).join(', '),
            })
          : t('reauth.loginTitle', { character })
      }
      actionLabel={missing.length > 0 ? t('reauth.grantAction') : t('reauth.loginAction')}
      onLogin={() => void beginEveLogin({ groups: permissionsForRoute(path) })}
      soleAction
    />
  );
}
