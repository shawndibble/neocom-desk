import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGate } from '@/components/DataGate';
import type { CorpRouteGate } from './useCorpRouteGate';

export function CorpRolesGate({ gate, children }: { gate: CorpRouteGate; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <DataGate
      status={gate.status === 'failed' ? 'failed' : gate.status === 'loading' ? 'busy' : 'ok'}
      title={t('corp.rolesUnavailable')}
      hint={t('corp.rolesUnavailableHint')}
      onRetry={gate.status === 'failed' ? gate.retry : undefined}
    >
      {children}
    </DataGate>
  );
}
