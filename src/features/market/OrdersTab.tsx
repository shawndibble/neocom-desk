import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
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
 * Market's Open orders tab with its Character / Corporation scope, a choice on
 * the Character filter picker. Hide, don't lock: a Character without the
 * Accountant or Trader role and the corp orders scope sees neither the option
 * nor the corp view, even from a pasted link.
 */
export function OrdersTab({ headerSlots }: { headerSlots: PageHeaderSlots }) {
  const { t } = useTranslation();
  const { state, capabilities, readFailed } = useCorpAccess();
  const hydrated = useActiveCharacter((store) => store.hydrated);
  const hasCharacter = useActiveCharacter((store) => store.activeCharacterId !== null);
  const [scopeParam, setScopeParam] = useUrlParam('scope', SCOPE_PARAM);
  const corpAvailable = state === 'ready' && capabilities.canReadOrders;
  const corpView = corpAvailable && scopeParam === 'corp';
  // A pasted `?scope=corp` link waits for access to resolve rather than mount
  // the Character panel (and fire its reads) first. A failed roles read, or no
  // Character to resolve for, falls through to the Character view.
  const holdForAccess =
    scopeParam === 'corp' && state === 'unknown' && !readFailed && (!hydrated || hasCharacter);

  return (
    <>
      {holdForAccess ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : corpView ? (
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Spinner label={t('common.loading')} />
            </div>
          }
        >
          <CorpOrdersView
            headerSlots={headerSlots}
            onLeaveCorporation={() => setScopeParam(null)}
          />
        </Suspense>
      ) : (
        <OpenOrdersPanel
          headerSlots={headerSlots}
          onChooseCorporation={corpAvailable ? () => setScopeParam('corp') : undefined}
        />
      )}
    </>
  );
}
