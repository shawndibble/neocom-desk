import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { ESI_REGISTRY } from '@/esi/registry';
import { useUrlParam } from '@/lib/useUrlState';
import { optionalEnumParam } from '@/lib/urlState';
import { OpenOrdersPanel } from './OpenOrdersPanel';
import type { PageHeaderSlots } from './pageHeaderSlots';

const SCOPE_PARAM = optionalEnumParam(['corp'] as const);

const CORP_ORDERS_SCOPE = ESI_REGISTRY.getCorporationOrders.scope;

export function OrdersTab({ headerSlots }: { headerSlots: PageHeaderSlots }) {
  const { t } = useTranslation();
  const { state, capabilities, missingScopes, readFailed } = useCorpAccess();
  const hydrated = useActiveCharacter((store) => store.hydrated);
  const hasCharacter = useActiveCharacter((store) => store.activeCharacterId !== null);
  const [scopeParam, setScopeParam] = useUrlParam('scope', SCOPE_PARAM);
  const corpReadable = state === 'ready' && capabilities.canReadOrders;
  const corpNeedsGrant =
    !corpReadable &&
    (state === 'ready' || state === 'roles-without-grant') &&
    missingScopes.includes(CORP_ORDERS_SCOPE);
  const corpAvailable = corpReadable || corpNeedsGrant;
  const corpView = corpAvailable && scopeParam === 'corp';
  const holdForAccess =
    scopeParam === 'corp' && state === 'unknown' && !readFailed && (!hydrated || hasCharacter);

  return (
    <>
      {holdForAccess ? (
        <Spinner block="page" label={t('common.loading')} />
      ) : (
        <OpenOrdersPanel
          key={corpView ? (corpNeedsGrant ? 'corporation-grant' : 'corporation') : 'character'}
          headerSlots={headerSlots}
          corporation={corpView}
          corporationNeedsGrant={corpView && corpNeedsGrant}
          onChooseCorporation={corpAvailable ? () => setScopeParam('corp') : undefined}
          onLeaveCorporation={() => setScopeParam(null)}
        />
      )}
    </>
  );
}
