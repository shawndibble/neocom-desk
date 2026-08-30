import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';
import { beginEveLogin } from './loginFlow';
import { useGrantedScopes } from './useGrantedScopes';
import {
  isGatedRoute,
  missingScopesForRoute,
  routeStringsNamespace,
  type AppRoutePath,
} from './routeScopes';

interface ScopeGateProps {
  path: AppRoutePath;
  children: ReactNode;
}

/**
 * Scope gate: renders `ReauthBanner` *in place of* a route's content when the
 * active Character's grant is missing a scope that route needs.
 *
 * In place, not a redirect. A missing mail scope means mail is broken; the
 * rest of the app is fine, and navigating the user away from /mail would
 * claim otherwise. The nav and their location stay put.
 *
 * The check is the stored scope set versus the route's declared requirement
 * (`routeScopes.ts`) — known before a single request goes out, so the user
 * never watches a spinner resolve into an unexplained empty table. Nothing
 * here looks at response codes: ESI's 403 does not distinguish a missing
 * scope from a structure ACL the character isn't on.
 *
 * While the Dexie read is in flight it renders `children`. A spinner there
 * would cost every user a flash on every gated route and delay the view's
 * fetch behind a keyed IndexedDB lookup, to smooth over a case that only
 * arises when the grant is already broken.
 */
export function ScopeGate({ path, children }: ScopeGateProps) {
  const { t } = useTranslation();
  const gated = isGatedRoute(path);
  const granted = useGrantedScopes();

  if (!gated || granted === undefined) return <>{children}</>;
  if (missingScopesForRoute(path, granted).length === 0) return <>{children}</>;

  const namespace = routeStringsNamespace(path);
  return (
    <ReauthBanner
      title={t(`${namespace}.reauthTitle`)}
      hint={t(`${namespace}.reauthHint`)}
      actionLabel={t(`${namespace}.reauthAction`)}
      onLogin={() => void beginEveLogin()}
    />
  );
}
