import type {
  AgentsFile,
  BlueprintMap,
  Certificate,
  CertifiedPlan,
  FittingSlotMap,
  InventionData,
  MarketWideTreeMap,
  MasteryMap,
  MutaplasmidData,
  NpcCorporationsFile,
  PiData,
  PiSystemPlanets,
  ReprocessingMap,
  SkillAttributeModifierMap,
  ShipTreeData,
  SkillType,
  TypeMap,
} from './types';
import { sdeDataUrl } from './sdeDataUrl';
import { fetchJsonWithIdleTimeout } from '@/lib/idleTimeout';
import { memoizeAsync } from '@/lib/memoizeAsync';

function fetchJson<T>(file: string): Promise<T> {
  return fetchJsonWithIdleTimeout<T>(sdeDataUrl(import.meta.env.BASE_URL, file), file);
}

function cached<T>(file: string): () => Promise<T> {
  return memoizeAsync(() => fetchJson<T>(file));
}

export const loadSkills = cached<SkillType[]>('skills.json');
/** See `MasteryMap`. */
export const loadMasteries = cached<MasteryMap>('masteries.json');
/** See `CertifiedPlan`. Small (~110 KB), so precached with the shell rather than lazy. */
export const loadCertifiedPlans = cached<CertifiedPlan[]>('certifiedPlans.json');
/** See `Certificate`. Small (~100 KB), so precached like `certifiedPlans.json`. */
export const loadCertificates = cached<Certificate[]>('certificates.json');
/** See `SkillAttributeModifierMap`. */
export const loadSkillAttributeModifiers = cached<SkillAttributeModifierMap>(
  'skillAttributeModifiers.json'
);
export const loadBlueprints = cached<BlueprintMap>('blueprints.json');
/** See `InventionData`. Lazy: only invention pricing reads it. */
export const loadInvention = cached<InventionData>('invention.json');
export const loadTypes = cached<TypeMap>('types.json');
/** A type's name, or a `Type {id}` placeholder for one the pinned SDE doesn't have. */
export async function typeName(typeId: number): Promise<string> {
  const types = await loadTypes();
  return types[String(typeId)]?.name ?? `Type ${typeId}`;
}
/** SDE groupID -> categoryID, for every group: `types.json` carries only a type's group. */
export const loadGroupCategories = cached<Record<string, number>>('groupCategories.json');
export const loadPi = cached<PiData>('pi.json');
/**
 * What each market-listed type reprocesses into (issue #537), for the
 * "reprocess and sell the materials" comparison. Its own file rather than
 * part of `types.json`: only that one comparison needs it, and `types.json`
 * is loaded by every route that names an item.
 */
export const loadReprocessing = cached<ReprocessingMap>('reprocessing.json');
/**
 * Per-planet radius in km, keyed by planetId — the one input a link's cost
 * needs that is neither a dogma attribute nor in ESI (issue #440).
 *
 * Its own file rather than part of `pi.json`: it is one entry per planet in
 * New Eden (~68k, 328 KB gzipped), and only the Advisor needs it, so every
 * other consumer of `pi.json` would otherwise pay for it on load.
 */
export const loadPiPlanetRadius = cached<Record<string, number>>('pi-planet-radius.json');
/**
 * System -> planet-type counts (see `PiSystemPlanets`), for finding the
 * nearest systems with a given planet type without per-system ESI calls.
 */
export const loadPiSystemPlanets = cached<PiSystemPlanets>('pi-system-planets.json');
/**
 * TypeIDs of the five moon-ore rarity tiers (Ubiquitous/Common/Uncommon/Rare/
 * Exceptional), derived at build time from the "Moon Ores" market group
 * (issue #523, `scripts/build-sde.mjs`). This is the allowlist that isolates
 * moon-mining rows in the personal mining ledger — ordinary asteroid ore and
 * ice already arrive under different type_ids, so filtering to this list is
 * the whole of it.
 */
export const loadMoonOreTypeIds = cached<number[]>('moonOreTypes.json');
/**
 * TypeIDs of every ore/ice type this app can name at all — moon, asteroid and
 * ice alike (issue #523). A superset of `loadMoonOreTypeIds`'s result, used to
 * tell "ordinary asteroid ore/ice, silently not moon mining" apart from a
 * genuinely unrecognized type_id in the personal mining ledger — the
 * allowlist-gap case the "unclassified ore" banner exists to catch.
 */
export const loadOreAndIceTypeIds = cached<number[]>('oreAndIceTypeIds.json');
/**
 * TypeIDs of every harvestable gas cloud type — Fullerites, Mykoserocin and
 * Cytoserocin, plus their compressed forms (issue #880). Its own list rather
 * than part of `loadOreAndIceTypeIds`'s: gas sits under an entirely different
 * market-group root than ore/ice ("Gas Clouds Materials" under Materials, not
 * the Ore tree), and only the Mining Yield tracker wants it. The Moon Mining
 * Tax ledger's ore/ice-vs-unclassified split is deliberately left alone — see
 * `docs/context/decisions/20260911-223903-…`.
 */
export const loadGasCloudTypeIds = cached<number[]>('gasCloudTypeIds.json');
/**
 * Raw ore/ice typeId -> its "Compressed " counterpart's typeId, for every
 * pair the SDE's naming convention resolves (issue #523's corp-tax-parity
 * decision). Matched by name at build time (`scripts/build-sde.mjs`), not
 * market group id: the ledger only ever reports raw typeIds, but a corp
 * valuing what got mined prices the (generally more liquid) compressed
 * item's market data instead — this is how the pricing layer finds that
 * item. A raw type with no entry here has no compressed counterpart at all
 * (rare, but real) and prices as itself.
 */
export const loadCompressedOreTypeIds = cached<Record<string, number>>('compressedOreTypeIds.json');
/**
 * Every manufacturing blueprint's flattened material tree, precomputed at SDE
 * build time (issue #819) — the market-wide Build Opportunities scan's input,
 * so ranking the whole SDE never resolves a sub-build tree live per candidate.
 */
export const loadMarketWideTrees = cached<MarketWideTreeMap>('marketWideTrees.json');
/** See `FittingSlotMap` — which rack an EFT-loaded item goes in. */
export const loadFittingSlots = cached<FittingSlotMap>('fittingSlots.json');
/**
 * What each mutaplasmid rolls, and every abyssal type (`MutaplasmidData`).
 * Read through `features/abyssal/mutaplasmidData.ts`'s lookup, not directly.
 * Precached: ~13 KB gzipped, and an EFT paste or share link may need it offline.
 */
export const loadMutaplasmids = cached<MutaplasmidData>('mutaplasmids.json');

/** The Ship Tree's classes, factions and hulls — see `ShipTreeData`. */
export const loadShipTree = cached<ShipTreeData>('shipTree.json');

/**
 * Every type name the game has, published or not (`scripts/lib/typeNames.mjs`)
 * — for telling an item CCP removed from one `types.json` just doesn't carry.
 * ~1.7 MB, so not precached: only the EVE Workbench's out-of-date check reads it.
 */
export const loadGameTypeNames = cached<string[]>('typeNames.json');

/** Hole type ("M267") -> [max per jump, max total] in kg, for Route Safety's mass check (issue #2906). */
export const loadWormholeMass = cached<Record<string, [number, number]>>('wormholeMass.json');
/** ESI `character_title_id` (UUID) -> English title name (issue #4777). */
export const loadCharacterTitles = cached<Record<string, string>>('characterTitles.json');
/**
 * The NPC agents a pilot can talk to (`AgentsFile`). Read through `agents.ts`'s
 * `loadAgents` index, not directly. Not precached: ~140 KB gzipped, and only
 * the Contacts standings view reads it.
 */
export const loadAgentsFile = cached<AgentsFile>('agents.json');
/**
 * Every NPC corporation and the faction names (`NpcCorporationsFile`). Read
 * through `npcCorporations.ts`'s `loadNpcCorporations` index. Precached: ~6 KB
 * gzipped, and a corporation's faction is wanted wherever its standing is.
 */
export const loadNpcCorporationsFile = cached<NpcCorporationsFile>('npcCorporations.json');
/**
 * Published hull typeId -> [name, groupID, mass in kg, base jump drive?], for
 * the same check. The drive (issue #3147) is `[rangeLy, fuelTypeId, fuelPerLy]`
 * and is absent on a hull without one.
 */
export const loadShipMass =
  cached<Record<string, [string, number, number, [number, number, number]?]>>('shipMass.json');
