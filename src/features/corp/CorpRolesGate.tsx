import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGate } from '@/components/DataGate';
import type { CorpRouteGate } from './useCorpRouteGate';

/**
 * The part of every `/corp*` route that waits on the roles read: a spinner while
 * it runs, and "Can't check your corporation roles" with Try again once it has
 * failed (offline, nothing cached). `children` is what the route shows once the
 * gate has resolved to `denied` or `ready`.
 */
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
