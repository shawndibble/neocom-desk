/**
 * `/corp/srp` (ADR 0026): the officer's SRP, Queue and Settings,
 * for a pilot with `canManageSrp` (`features/corp/srp/srpViews.ts`). A pilot's own claims are the
 * Overview's SRP sub-view at `/srp` (`routes/Srp.tsx`); a pilot who is no officer and opens this
 * path is sent there.
 */
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
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <PageHeader title={t('srp.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('srp.officer.deniedTitle')}
          hint={t('srp.officer.deniedHint')}
        />
      </div>
    ) : gate.status === 'ready' ? (
      <SrpPage
        canManageSrp
        srpOn={srpOn}
        // `canReadRoleAudit` is Director alone in `corpRoles.ts`: the role Settings needs too.
        isDirector={gate.capabilities.canReadRoleAudit}
      />
    ) : null;
  return <CorpRolesGate gate={gate}>{content}</CorpRolesGate>;
}
