import { wholeNumber } from './stationOwners.mjs';

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
