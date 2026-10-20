/**
 * Boot warm-up for the lookups a page resolves *beside* its own list: entity
 * names (mail parties, contract parties, LP corporations), citadel names,
 * LP Store offers and the implant types behind the Clones view. A device that
 * never opened those pages online has none of them cached, so the first
 * offline visit showed raw `#id`s. See
 * docs/context/decisions/20260902-174203-cache-everything-warm-it-at-boot.md.
 *
 * Runs after the list tasks (`app/prefetch.ts`'s second phase) and reads the
 * ids out of the lists those already cached, never fetching a list itself.
 * Each warm calls the same loader the page calls, so cache keys cannot drift,
 * and goes through `prefetchDetails`' low-concurrency, gated, background-lane
 * fetch. Every warm is bounded and never rejects.
 */
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

/** Most structures (citadels) resolved per Character per boot. Low on purpose: each one the Character is not on the ACL of is a 403, which counts against ESI's error limit. */
export const STRUCTURE_PREFETCH_LIMIT = 30;
/** Most LP Stores warmed per Character: the corporations they hold the most LP with. */
export const LP_STORE_PREFETCH_LIMIT = 15;

function positive(ids: readonly (number | undefined)[]): number[] {
  return [...new Set(ids.filter((id): id is number => id !== undefined && id > 0))];
}

/**
 * Sender and recipient ids of mail headers, contract parties, and LP
 * corporations: what Mail, Contracts and the Wallet's Loyalty Points view pass
 * to `resolveNames`. Mailing-list recipients are left out, as Mail leaves them
 * out: `/universe/names` fails the whole batch on an id it cannot resolve.
 */
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
  /** Resolved by `loadStructureName`: Assets, Orders, Clones. */
  structures: number[];
  /** Resolved by `loadContractLocationName`, which also fills the structure row. */
  contractLocations: number[];
}

/**
 * Structure ids found in cached assets, orders, clones and contracts, capped at
 * {@link STRUCTURE_PREFETCH_LIMIT} between the two kinds (contract locations
 * reserved first, then orders, clones and assets).
 */
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

/** Implant typeIDs worn now and sitting in jump clones. */
export function implantTypeIdsFor(
  worn: readonly number[],
  clones: CharacterClones | undefined
): number[] {
  return positive([...worn, ...(clones?.jump_clones ?? []).flatMap((clone) => clone.implants)]);
}

/** Corporations to warm an LP Store for: biggest balances first, bounded. */
export function lpStoreCorporationsFor(loyalty: readonly CharacterLoyaltyPoints[]): number[] {
  return positive(
    [...loyalty]
      .sort((a, b) => b.loyalty_points - a.loyalty_points)
      .slice(0, LP_STORE_PREFETCH_LIMIT)
      .map((entry) => entry.corporation_id)
  );
}

/** Names for the parties on the Character's cached mail, contracts and LP list. */
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
  // One bulk POST per 1000 ids, inside `resolveNames`; a cached name costs no request.
  await inBackgroundLane(() => resolveNames(ids));
}

/** Citadel names (and each forbidden one's refusal memo) for the Character's cached rows. */
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

/** LP Store offers (and the corporation's name for the store header) for the Character's LP corporations. */
export async function warmLoyaltyStores(characterId: number): Promise<void> {
  const loyalty = await readCached<CharacterLoyaltyPoints[]>(characterId, LOYALTY_KEY);
  const corporations = lpStoreCorporationsFor(loyalty ?? []);
  await prefetchDetails(corporations, (id) => loadLoyaltyStoreOffers(id));
  await prefetchDetails(corporations, (id) => loadCorporationName(id));
}

/** Worn and jump-clone implant types as their readers read them: the baked shard, else cached ESI. */
export async function warmImplantTypes(characterId: number): Promise<void> {
  const [worn, clones] = await Promise.all([
    readCached<number[]>(characterId, SKILL_KEYS.implants),
    readCached<CharacterClones>(characterId, CLONES_KEY),
  ]);
  await prefetchDetails(implantTypeIdsFor(worn ?? [], clones), (id) =>
    loadTypeDetail(id, { retry: true })
  );
}
