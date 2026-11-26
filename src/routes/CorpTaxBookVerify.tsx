import { useParams } from 'react-router-dom';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { VerifyPage } from '@/features/corpTaxBook/VerifyPage';

export function CorpTaxBookVerify() {
  useMarkPublicRouteRendered();
  const { token = '' } = useParams();
  return <VerifyPage token={token} />;
}
