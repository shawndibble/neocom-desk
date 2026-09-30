// Pure half of build-sde.mjs's `market/lpCorporations.json` (issue #2320):
// every NPC corporation that runs an LP Store, so the app can search all of
// them offline instead of only the corps a Character already holds LP with.
//
// The SDE carries no "has an LP store" flag, so the build probes ESI's public
// `GET /loyalty/stores/{corporation_id}/offers/` per NPC corp and keeps the
// ones with at least one offer. The network call is injected (`hasOffers`) so
// the selection and caching rules are testable without ESI.
// Takes the array-of-arrays `parseCsv` returns (header row first, every cell a
// string), same as `stationOwners.mjs`.

function wholeNumber(s) {
  if (s === undefined || s === '') return null;
  const value = Number(s);
  return Number.isInteger(value) ? value : null;
}

/**
 * `crpNPCCorporations` rows -> `[{ id, name, factionId? }]`. A blank faction
 * leaves the key off rather than writing null, the same convention as the
 * station owner fields.
 */
export function npcCorporations(rows) {
  const header = rows[0];
  const idCol = header.indexOf('corporationID');
  const nameCol = header.indexOf('corporationName');
  const factionCol = header.indexOf('factionID');
  const corps = [];
  for (let i = 1; i < rows.length; i++) {
    const id = wholeNumber(rows[i][idCol]);
    if (id === null) continue;
    const corp = { id, name: rows[i][nameCol] ?? '' };
    const factionId = wholeNumber(rows[i][factionCol]);
    if (factionId !== null) corp.factionId = factionId;
    corps.push(corp);
  }
  return corps;
}

/**
 * Keeps the corps whose LP Store has at least one offer, sorted by name.
 *
 * `cache` maps corporation id -> boolean from earlier builds; a cached id is
 * never re-probed, and a fresh answer (including `false`) is added to the
 * returned copy so a rebuild doesn't probe ~280 corps again. A probe that
 * throws is left out of both the result and the cache, so the next build
 * retries it rather than remembering a transient failure as "no store".
 * Probes run one at a time: this is build-time courtesy traffic, not a race.
 */
export async function probeLpStores(corps, { cache, hasOffers, warn = console.warn }) {
  const nextCache = { ...cache };
  const lpCorporations = [];
  const failed = [];
  let probed = 0;
  for (const corp of corps) {
    let hasStore = nextCache[corp.id];
    if (typeof hasStore !== 'boolean') {
      try {
        hasStore = await hasOffers(corp.id);
      } catch (err) {
        warn(`  LP store: corporation ${corp.id} (${corp.name}) failed: ${err.message}`);
        failed.push(corp.id);
        continue;
      }
      probed++;
      nextCache[corp.id] = hasStore;
    }
    if (hasStore) lpCorporations.push(corp);
  }
  lpCorporations.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id - b.id);
  return { lpCorporations, cache: nextCache, probed, failed };
}
