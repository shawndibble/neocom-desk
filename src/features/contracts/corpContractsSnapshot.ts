import { ESI_REGISTRY } from '@/esi/registry';
import type { CachedResult } from '@/esi/cache';
import type { Contract } from '@/esi/endpoints';
import { loadCorporationId } from '@/features/corp/boardData';
import { loadCorporationContracts } from '@/features/corp/contracts';
import { contractIssuer, contractReceiver } from '@/features/character/contractCounterparty';
import { resolveCategories, resolveNames, type NameCategory } from '@/features/character/names';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { loadGrantedScopes } from '@/app/grantedScopes';

const SCOPE = ESI_REGISTRY.getCorporationContracts.scope;

export interface CorpContractsSnapshot {
  corporationId: number | null;
  contractsResult: CachedResult<Contract[]> | null;
  needsReauth: boolean;
  truncated: boolean;
  names: Map<number, string>;
  receiverCategories: Map<number, NameCategory>;
}

export async function loadCorpContractsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<CorpContractsSnapshot> {
  const empty: CorpContractsSnapshot = {
    corporationId: null,
    contractsResult: null,
    needsReauth: false,
    truncated: false,
    names: new Map(),
    receiverCategories: new Map(),
  };
  const granted = await loadGrantedScopes(characterId);
  if (!granted.has(SCOPE)) return { ...empty, needsReauth: true };
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return empty;
  const { cached: contractsResult, needsReauth } = await loadCorporationContracts(
    characterId,
    corporationId
  );
  const contracts = signal.cancelled ? [] : (contractsResult?.data ?? []);
  const receiverIds = contracts.flatMap((c) => contractReceiver(c, corporationId)?.id ?? []);
  const [names, receiverCategories] = await Promise.all([
    resolveNames([...contracts.map((c) => contractIssuer(c).id), ...receiverIds]),
    resolveCategories(receiverIds),
  ]);
  return {
    corporationId,
    contractsResult,
    needsReauth,
    truncated: contractsResult?.truncated ?? false,
    names,
    receiverCategories,
  };
}
