import type {
  CharacterAsset,
  CharacterClones,
  CharacterLoyaltyPoints,
  Contract,
  MailHeader,
  MarketOrder,
} from '@/esi/endpoints';
import { readCached } from '@/esi/cache';
import { inBackgroundLane } from '@/esi/lane';
import { UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import { KEY as ASSETS_KEY } from '@/features/assets/assets';
import { KEY as CONTRACTS_KEY } from './contracts';
import { KEYS as ORDER_KEYS } from './orders';
import { KEY as LOYALTY_KEY } from './loyalty';
import { KEYS as MAIL_KEYS } from './mail';
import { KEY as CLONES_KEY } from './clones';
import { KEYS as SKILL_KEYS } from '@/features/skills/data';
import { loadTypeDetail } from '@/features/skills/typeDetail';
import { loadLoyaltyStoreOffers, loadCorporationName } from '@/features/loyalty/store';
import { contractIssuer, contractReceiver } from './contractCounterparty';
import { loadContractLocationName } from './contractLocationName';
import { detailPrefetchAllowed, prefetchDetails } from './detailPrefetch';
import { resolveNames } from './names';
import { loadStructureName } from './structures';

export const STRUCTURE_PREFETCH_LIMIT = 30;
export const LP_STORE_PREFETCH_LIMIT = 15;

function positive(ids: readonly (number | undefined)[]): number[] {
  return [...new Set(ids.filter((id): id is number => id !== undefined && id > 0))];
}

export function nameIdsFor(input: {
  characterId: number;
  headers: readonly MailHeader[];
  contracts: readonly Contract[];
  loyalty: readonly CharacterLoyaltyPoints[];
}): number[] {
  return positive([
    ...input.headers.flatMap((header) => [
      header.from,
      ...(header.recipients ?? [])
        .filter((r) => r.recipient_type !== 'mailing_list')
        .map((r) => r.recipient_id),
    ]),
    ...input.contracts.flatMap((contract) => [
      contractIssuer(contract).id,
      contractReceiver(contract, input.characterId)?.id,
    ]),
    ...input.loyalty.map((entry) => entry.corporation_id),
  ]);
}

export interface StructureIds {
  structures: number[];
  contractLocations: number[];
}

export function structureIdsFor(input: {
  assets: readonly CharacterAsset[];
  orders: readonly MarketOrder[];
  clones: CharacterClones | undefined;
  contracts: readonly Contract[];
}): StructureIds {
  const itemIds = new Set(input.assets.map((a) => a.item_id));
  const contractLocations = positive(
    input.contracts.flatMap((c) => [c.start_location_id, c.end_location_id])
  ).filter((id) => id >= UPWELL_STRUCTURE_ID_FLOOR);
  const taken = new Set(contractLocations);
  const structures = positive([
    ...input.orders.map((o) => o.location_id).filter((id) => id >= UPWELL_STRUCTURE_ID_FLOOR),
    ...(input.clones?.jump_clones ?? [])
      .filter((clone) => clone.location_type === 'structure')
      .map((clone) => clone.location_id),
    ...(input.clones?.home_location?.location_type === 'structure'
      ? [input.clones.home_location.location_id]
      : []),
    ...input.assets.filter((a) => a.location_type === 'other').map((a) => a.location_id),
    ...input.assets
      .filter((a) => a.location_type === 'item' && !itemIds.has(a.location_id))
      .map((a) => a.location_id),
  ]).filter((id) => !taken.has(id));
  const room = Math.max(0, STRUCTURE_PREFETCH_LIMIT - contractLocations.length);
  return {
    contractLocations: contractLocations.slice(0, STRUCTURE_PREFETCH_LIMIT),
    structures: structures.slice(0, room),
  };
}

export function implantTypeIdsFor(
  worn: readonly number[],
  clones: CharacterClones | undefined
): number[] {
  return positive([...worn, ...(clones?.jump_clones ?? []).flatMap((clone) => clone.implants)]);
}

export function lpStoreCorporationsFor(loyalty: readonly CharacterLoyaltyPoints[]): number[] {
  return positive(
    [...loyalty]
      .sort((a, b) => b.loyalty_points - a.loyalty_points)
      .slice(0, LP_STORE_PREFETCH_LIMIT)
      .map((entry) => entry.corporation_id)
  );
}

export async function warmNames(characterId: number): Promise<void> {
  if (!detailPrefetchAllowed()) return;
  const [headers, contracts, loyalty] = await Promise.all([
    readCached<MailHeader[]>(characterId, MAIL_KEYS.headers),
    readCached<Contract[]>(characterId, CONTRACTS_KEY),
    readCached<CharacterLoyaltyPoints[]>(characterId, LOYALTY_KEY),
  ]);
  const ids = nameIdsFor({
    characterId,
    headers: headers ?? [],
    contracts: contracts ?? [],
    loyalty: loyalty ?? [],
  });
  await inBackgroundLane(() => resolveNames(ids));
}

export async function warmStructureNames(characterId: number): Promise<void> {
  const [assets, orders, clones, contracts] = await Promise.all([
    readCached<CharacterAsset[]>(characterId, ASSETS_KEY),
    readCached<MarketOrder[]>(characterId, ORDER_KEYS.open),
    readCached<CharacterClones>(characterId, CLONES_KEY),
    readCached<Contract[]>(characterId, CONTRACTS_KEY),
  ]);
  const ids = structureIdsFor({
    assets: assets ?? [],
    orders: orders ?? [],
    clones,
    contracts: contracts ?? [],
  });
  await prefetchDetails(ids.contractLocations, (id) => loadContractLocationName(characterId, id));
  await prefetchDetails(ids.structures, (id) => loadStructureName(characterId, id));
}

export async function warmLoyaltyStores(characterId: number): Promise<void> {
  const loyalty = await readCached<CharacterLoyaltyPoints[]>(characterId, LOYALTY_KEY);
  const corporations = lpStoreCorporationsFor(loyalty ?? []);
  await prefetchDetails(corporations, (id) => loadLoyaltyStoreOffers(id));
  await prefetchDetails(corporations, (id) => loadCorporationName(id));
}

export async function warmImplantTypes(characterId: number): Promise<void> {
  const [worn, clones] = await Promise.all([
    readCached<number[]>(characterId, SKILL_KEYS.implants),
    readCached<CharacterClones>(characterId, CLONES_KEY),
  ]);
  await prefetchDetails(implantTypeIdsFor(worn ?? [], clones), (id) =>
    loadTypeDetail(id, { retry: true })
  );
}
