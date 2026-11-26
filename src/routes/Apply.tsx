import { useParams, useSearchParams } from 'react-router-dom';
import { beginAddCharacterLogin, beginVettingLogin } from '@/app/loginFlow';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';
import { ApplyPage } from '@/features/corp/vetting/ApplyPage';
import { VettingPublicFrame } from '@/features/corp/vetting/VettingPublicFrame';
import { useConsumedVettingLogin } from '@/features/corp/vetting/useConsumedVettingLogin';

export function Apply() {
  useMarkPublicRouteRendered();
  const { corpId = '' } = useParams();
  const [search] = useSearchParams();
  const corporationId = /^\d{1,12}$/.test(corpId) ? Number(corpId) : null;
  const login = useConsumedVettingLogin();
  const characters = useCharacterCountOrLoading();
  return (
    <VettingPublicFrame>
      <ApplyPage
        corporationId={corporationId}
        invite={search.get('invite')}
        login={login}
        onSignIn={(reviewId) => {
          if (corporationId !== null) void beginVettingLogin(corporationId, reviewId);
        }}
        onOpenApp={characters === 0 ? () => void beginAddCharacterLogin() : undefined}
      />
    </VettingPublicFrame>
  );
}
