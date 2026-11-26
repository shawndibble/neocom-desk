import { useParams } from 'react-router-dom';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { RemoveNowPage } from '@/features/corpTaxBook/RemoveNowPage';

export function CorpTaxBookRemoveNow() {
  useMarkPublicRouteRendered();
  const { code = '' } = useParams();
  return <RemoveNowPage code={code} />;
}
