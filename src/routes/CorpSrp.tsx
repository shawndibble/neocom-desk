import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import { CorpDenied } from '@/features/corp/CorpDenied';
import { CorpRolesGate } from '@/features/corp/CorpRolesGate';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { SrpPage } from '@/features/corp/srp/SrpPage';
import { useSrpNavVisible } from '@/features/corp/srp/useSrpNavVisible';

export function CorpSrp() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canManageSrp);
  const srpOn = useSrpNavVisible();
  if (gate.status === 'denied' && (gate.reason === 'none' || gate.reason === 'capability')) {
    return <Navigate to="/srp" replace />;
  }
  const content =
    gate.status === 'denied' ? (
      <div className="mx-auto max-w-page space-y-4">
        <PageHeader title={t('srp.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('srp.officer.deniedTitle')}
          hint={t('srp.officer.deniedHint')}
          roleLine={t('srp.officer.roleLine')}
        />
      </div>
    ) : gate.status === 'ready' ? (
      <SrpPage canManageSrp srpOn={srpOn} isDirector={gate.capabilities.canConfigureSrp} />
    ) : null;
  return <CorpRolesGate gate={gate}>{content}</CorpRolesGate>;
}
