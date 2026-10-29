import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { ESI_REGISTRY } from '@/esi/registry';
import { useUrlParam } from '@/lib/useUrlState';
import { optionalEnumParam } from '@/lib/urlState';
import { OpenOrdersPanel } from './OpenOrdersPanel';
import type { PageHeaderSlots } from './pageHeaderSlots';

/** `?scope=corp` on Open orders: the corporation's orders. Absent is the Character's own (ADR 0015). */
const SCOPE_PARAM = optionalEnumParam(['corp'] as const);

const CORP_ORDERS_SCOPE = ESI_REGISTRY.getCorporationOrders.scope;

/**
 * Market's Open orders tab. Corporation is a data source of the same panel,
 * a choice on the Character filter picker beside This / All characters. Hide, don't lock: a Character without the
 * Accountant or Trader role (or Director) sees neither the option nor the corp
 * view, even from a pasted link. One with the role but an older corp grant
 * that predates the orders scope still gets the option: the corp view then
 * asks for the scope instead of the option silently not being there.
 */
export function OrdersTab({ headerSlots }: { headerSlots: PageHeaderSlots }) {
  const { t } = useTranslation();
  const { state, capabilities, missingScopes, readFailed } = useCorpAccess();
  const hydrated = useActiveCharacter((store) => store.hydrated);
  const hasCharacter = useActiveCharacter((store) => store.activeCharacterId !== null);
  const [scopeParam, setScopeParam] = useUrlParam('scope', SCOPE_PARAM);
  const corpReadable = state === 'ready' && capabilities.canReadOrders;
  // The role holds the capability; only the additive scope is missing (`corpScopes.ts`).
  const corpNeedsGrant =
    !corpReadable &&
    (state === 'ready' || state === 'roles-without-grant') &&
    missingScopes.includes(CORP_ORDERS_SCOPE);
  const corpAvailable = corpReadable || corpNeedsGrant;
  const corpView = corpAvailable && scopeParam === 'corp';
  // A pasted `?scope=corp` link waits for access to resolve rather than mount
  // the Character panel (and fire its reads) first. A failed roles read, or no
  // Character to resolve for, falls through to the Character view.
  const holdForAccess =
    scopeParam === 'corp' && state === 'unknown' && !readFailed && (!hydrated || hasCharacter);

  return (
    <>
      {holdForAccess ? (
        <Spinner block="page" label={t('common.loading')} />
      ) : (
        // Keyed by source: a switch is a fresh load, never the other source's rows for a frame.
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
