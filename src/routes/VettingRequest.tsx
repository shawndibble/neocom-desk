import { beginVettingLogin } from '@/app/loginFlow';
import { VettingRequestPage } from '@/features/corp/vetting/VettingRequestPage';
import { useConsumedVettingLogin } from '@/features/corp/vetting/useConsumedVettingLogin';

export function VettingRequest() {
  const login = useConsumedVettingLogin();
  return (
    <VettingRequestPage
      login={login}
      onSignIn={(corporationId, reviewId) => void beginVettingLogin(corporationId, reviewId)}
    />
  );
}
