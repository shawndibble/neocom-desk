import { beginVettingLogin } from '@/app/loginFlow';
import { VettingRequestPage } from '@/features/corp/vetting/VettingRequestPage';
import { useConsumedVettingLogin } from '@/features/corp/vetting/useConsumedVettingLogin';

/**
 * `/vetting`: the signed-in pilot's own review request (an officer asked for one before a
 * promotion). Not a Corp page: the member answering it is usually no officer, so it sits outside
 * the corp gate. A character whose device sign-in does not cover the report signs in again for
 * exactly the report's scopes and returns here.
 */
export function VettingRequest() {
  const login = useConsumedVettingLogin();
  return (
    <VettingRequestPage
      login={login}
      onSignIn={(corporationId, reviewId) => void beginVettingLogin(corporationId, reviewId)}
    />
  );
}
