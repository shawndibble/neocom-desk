import { isNpcCorporationId } from '@/esi/entityIds';
import type { AccountCorporation } from './accountCorporationsContext';
import { loadAccountCorpAccess } from './corpReadAccess';
import { loadCorpLabels } from './corpTicker';

/** Every player corporation some stored Character's corp gate settled for, in account order. */
export async function loadAccountCorporations(): Promise<AccountCorporation[]> {
  const accounts = await loadAccountCorpAccess();
  const ids = [...new Set(accounts.map(({ access }) => access.corporationId))].filter(
    (id) => !isNpcCorporationId(id)
  );
  const labels = await loadCorpLabels(ids);
  return ids.map((id) => ({
    id,
    label: labels.get(id) ?? { ticker: String(id), name: String(id) },
  }));
}
