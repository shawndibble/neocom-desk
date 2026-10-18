import { useParams } from 'react-router-dom';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { VerifyPage } from '@/features/corpTaxBook/VerifyPage';

/**
 * A Statement's verify link, `/corp-tax-book/verify/<token>` (issue #4066, D27):
 * outside `RequireCharacter` and `ScopeGate` deliberately, since the miner it
 * was mailed to may have no account (`routeScopes.test.ts` asserts the
 * exemption). The token is the credential and never leaves this route: the
 * analytics page path is the route pattern, not the raw path.
 */
export function CorpTaxBookVerify() {
  useMarkPublicRouteRendered();
  const { token = '' } = useParams();
  return <VerifyPage token={token} />;
}
