/**
 * `/corp/srp` (issue #4851, epic #4608, ADR 0026): the corp's ship replacement program. Behind
 * the Corp gate with `canManageSrp` (Director or Accountant), like the other `/corp*` routes. Its
 * views (`features/corp/srp/srpViews.ts`) narrow further: Settings is a Director's.
 */
import { useTranslation } from 'react-i18next';
import { LoadFailedState, Spinner } from '@/components/ui';
import { CorpDenied } from '@/features/corp/CorpDenied';
import { SrpPage } from '@/features/corp/srp/SrpPage';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';

export function CorpSrp() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((c) => c.canManageSrp);
  switch (gate.status) {
    case 'loading':
      return <Spinner label={t('common.loading')} />;
    case 'failed':
      return (
        <LoadFailedState
          title={t('corp.rolesUnavailable')}
          hint={t('corp.rolesUnavailableHint')}
          onRetry={gate.retry}
        />
      );
    case 'denied':
      return (
        <CorpDenied
          reason={gate.reason}
          title={t('srp.noAccessTitle')}
          hint={t('srp.noAccessHint')}
        />
      );
    case 'ready':
      return <SrpPage canManageSrp={gate.capabilities.canManageSrp} />;
  }
}
