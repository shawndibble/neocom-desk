import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl, Spinner } from '@/components/ui';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useUrlParam } from '@/lib/useUrlState';
import { optionalEnumParam } from '@/lib/urlState';
import { OpenOrdersPanel } from './OpenOrdersPanel';
import type { PageHeaderSlots } from './pageHeaderSlots';

/** The corp view is its own chunk: its reads are for the pilots who can use them. */
const CorpOrdersView = lazy(() =>
  import('./CorpOrdersView').then((m) => ({ default: m.CorpOrdersView }))
);
/** `?scope=corp` on Open orders: the corporation's orders. Absent is the Character's own (ADR 0015). */
const SCOPE_PARAM = optionalEnumParam(['corp'] as const);

/**
 * Market's Open orders tab with its Character / Corp scope. Hide, don't lock:
 * a Character without the Accountant or Trader role and the corp orders scope
 * sees neither the toggle nor the corp view, even from a pasted link.
 */
export function OrdersTab({ headerSlots }: { headerSlots: PageHeaderSlots }) {
  const { t } = useTranslation();
  const { state, capabilities } = useCorpAccess();
  const [scopeParam, setScopeParam] = useUrlParam('scope', SCOPE_PARAM);
  const corpAvailable = state === 'ready' && capabilities.canReadOrders;
  const corpView = corpAvailable && scopeParam === 'corp';

  return (
    <>
      {corpAvailable && (
        <SegmentedControl
          label={t('market.orders.corp.scopeLabel')}
          value={corpView ? 'corp' : 'character'}
          onChange={(next) => setScopeParam(next === 'corp' ? 'corp' : null)}
          options={[
            { value: 'character', label: t('market.orders.corp.characterScope') },
            { value: 'corp', label: t('market.orders.corp.corpScope') },
          ]}
        />
      )}
      {corpView ? (
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Spinner label={t('common.loading')} />
            </div>
          }
        >
          <CorpOrdersView headerSlots={headerSlots} />
        </Suspense>
      ) : (
        <OpenOrdersPanel headerSlots={headerSlots} />
      )}
    </>
  );
}
