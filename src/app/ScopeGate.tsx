import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewedCharacterId } from '@/features/character/viewedCharacter';
import { ReauthBanner } from '@/components/ui';
import { pageTitleFor } from './documentTitle';
import { beginEveLogin } from './loginFlow';
import { useGrantedScopes } from './useGrantedScopes';
import {
  isGatedRoute,
  missingScopesForRoute,
  permissionsForRoute,
  routeStringsNamespace,
  type AppRoutePath,
} from './routeScopes';

interface ScopeGateProps {
  path: AppRoutePath;
  children: ReactNode;
}

/**
 * Renders `ReauthBanner` *in place of* a route's content when the active
 * Character's grant lacks a scope that route needs. In place, not a redirect:
 * a missing mail scope breaks mail, not the app. ("Is anyone logged in at all"
 * is a separate question with a separate remedy — `RequireCharacter`.)
 *
 * Compares the stored grant against the route's declared requirement
 * (`routeScopes.ts`), so it decides before any request goes out and the user
 * never watches a spinner resolve into an unexplained empty table. Never
 * response codes: ESI answers 403 both for a missing scope and for a structure
 * ACL the character isn't on, and re-authing cannot fix the latter.
 *
 * `soleAction` because the banner is the entire page here: its button is the
 * only thing left to tap, so it takes the touch tier the app's other primary
 * actions get rather than the compact one a banner beside a view's own
 * controls uses.
 *
 * Passes `children` through while the Dexie read is in flight — a spinner would
 * flash for every user on every gated route, and delay the view's fetch behind
 * an IndexedDB lookup, to smooth over an already-broken grant.
 */
export function ScopeGate({ path, children }: ScopeGateProps) {
  const { t } = useTranslation();
  const gated = isGatedRoute(path);
  const granted = useGrantedScopes();
  // Assets opened for another Character (`?char=`) judges that
  // Character's grant itself (its own `GrantBanner`), not the active one's.
  const viewingOther = useViewedCharacterId() !== undefined && path === '/assets';

  if (!gated || granted === undefined || viewingOther) return <>{children}</>;
  if (missingScopesForRoute(path, granted).length === 0) return <>{children}</>;

  const namespace = routeStringsNamespace(path);
  return (
    <>
      <h1 className="sr-only">{pageTitleFor(path, t)}</h1>
      <ReauthBanner
        title={t(`${namespace}.reauthTitle`)}
        hint={t(`${namespace}.reauthHint`)}
        actionLabel={t(`${namespace}.reauthAction`)}
        onLogin={() => void beginEveLogin({ groups: permissionsForRoute(path) })}
        soleAction
      />
    </>
  );
}
