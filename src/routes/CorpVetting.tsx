/**
 * `/corp/vetting`: a corp's reviews of applicants, and of members before a promotion, for a
 * pilot with `canVet` (Director or Personnel Manager). The callables re-check the role live;
 * this gate only decides what to draw. A member's own review request is `/vetting`
 * (`routes/VettingRequest.tsx`); a pilot who is no reviewer and opens this path is sent there.
 */
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import { CorpDenied } from '@/features/corp/CorpDenied';
import { CorpRolesGate } from '@/features/corp/CorpRolesGate';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { VettingPage } from '@/features/corp/vetting/VettingPage';

export function CorpVetting() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canVet);
  if (gate.status === 'denied' && (gate.reason === 'none' || gate.reason === 'capability')) {
    return <Navigate to="/vetting" replace />;
  }
  const content =
    gate.status === 'denied' ? (
      <div className="mx-auto max-w-page space-y-4 px-4 py-4">
        <PageHeader title={t('vetting.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('vetting.deniedTitle')}
          hint={t('vetting.deniedHint')}
          roleLine={t('vetting.roleLine')}
        />
      </div>
    ) : gate.status === 'ready' ? (
      <VettingPage />
    ) : null;
  return <CorpRolesGate gate={gate}>{content}</CorpRolesGate>;
}
