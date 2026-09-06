import type { BlueprintMap, PiData, ReprocessingMap, SkillType, TypeMap } from './types';

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!res.ok) throw new Error(`Failed to load ${file}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function cached<T>(file: string): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= fetchJson<T>(file).catch((err) => {
      promise = null; // allow retry after failure
      throw err;
    });
    return promise;
  };
}

export const loadSkills = cached<SkillType[]>('skills.json');
export const loadBlueprints = cached<BlueprintMap>('blueprints.json');
export const loadTypes = cached<TypeMap>('types.json');
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
