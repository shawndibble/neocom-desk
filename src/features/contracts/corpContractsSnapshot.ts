import { db } from '@/db';
import { withAcceptedCourierInProgress } from '@/engine/contracts/contractStatus';
import { ESI_REGISTRY } from '@/esi/registry';
import type { CachedResult } from '@/esi/cache';
import type { Contract } from '@/esi/endpoints';
import { loadCorporationId } from '@/features/corp/boardData';
import { loadCorporationContracts } from '@/features/corp/contracts';
import { contractIssuer, contractReceiver } from '@/features/character/contractCounterparty';
import { resolveCategories, resolveNames, type NameCategory } from '@/features/character/names';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

const SCOPE = ESI_REGISTRY.getCorporationContracts.scope;

export interface CorpContractsSnapshot {
  /** Null when the corporation is unknown or the read is not allowed. */
  corporationId: number | null;
  contractsResult: CachedResult<Contract[]> | null;
  /** The grant lapsed or was never given: Grant access fixes it. */
  needsReauth: boolean;
  truncated: boolean;
  names: Map<number, string>;
  receiverCategories: Map<number, NameCategory>;
}

/**
 * The Contracts page's Corp view: the corporation's contracts, gated on the scope
 * alone. ESI names no role for this route, so a member with no corp role reads
 * it too (decision 20261020-215532); the read is never made without the grant.
 */
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
  const granted = (await db.tokens.get(characterId))?.scopes ?? [];
  if (!granted.includes(SCOPE)) return { ...empty, needsReauth: true };
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return empty;
  const { cached, needsReauth } = await loadCorporationContracts(characterId, corporationId);
  const contractsResult = cached && {
    ...cached,
    data: cached.data.map(withAcceptedCourierInProgress),
  };
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
