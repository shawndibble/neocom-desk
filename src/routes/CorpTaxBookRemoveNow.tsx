import { useParams } from 'react-router-dom';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { RemoveNowPage } from '@/features/corpTaxBook/RemoveNowPage';

/**
 * The payee's link in a removal mail, `/corp-tax-book/remove-now/<code>` (issue #4520): outside
 * `RequireCharacter` and `ScopeGate` deliberately, since the payee may have no account yet and
 * signs in on the page itself (`routeScopes.test.ts` asserts the exemption). The code is the
 * credential and never leaves this route: the analytics page path is the route pattern.
 */
export function CorpTaxBookRemoveNow() {
  useMarkPublicRouteRendered();
  const { code = '' } = useParams();
  return <RemoveNowPage code={code} />;
}
