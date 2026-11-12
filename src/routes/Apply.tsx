import { useParams } from 'react-router-dom';
import { beginAddCharacterLogin, beginVettingLogin } from '@/app/loginFlow';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';
import { ApplyPage } from '@/features/corp/vetting/ApplyPage';
import { VettingPublicFrame } from '@/features/corp/vetting/VettingPublicFrame';
import { useConsumedVettingLogin } from '@/features/corp/vetting/useConsumedVettingLogin';

/**
 * A corp's apply link, `/apply/<corporationId>`: outside `RequireCharacter` and `ScopeGate`
 * deliberately, since an applicant has no account (`routeScopes.test.ts` asserts the exemption).
 * Each character signs in with EVE for exactly what the report reads; that sign-in is never kept
 * as a device session. A pilot with no Character here is offered the app once the report is sent.
 */
export function Apply() {
  useMarkPublicRouteRendered();
  const { corpId = '' } = useParams();
  const corporationId = /^\d{1,12}$/.test(corpId) ? Number(corpId) : null;
  const login = useConsumedVettingLogin();
  const characters = useCharacterCountOrLoading();
  return (
    <VettingPublicFrame>
      <ApplyPage
        corporationId={corporationId}
        login={login}
        onSignIn={(reviewId) => {
          if (corporationId !== null) void beginVettingLogin(corporationId, reviewId);
        }}
        onOpenApp={characters === 0 ? () => void beginAddCharacterLogin() : undefined}
      />
    </VettingPublicFrame>
  );
}
