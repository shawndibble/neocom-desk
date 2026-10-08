/**
 * The CONCORD LP Exchange: a station service that converts CONCORD LP into a
 * corporation's LP. It costs `target LP / rate` CONCORD LP, so one CONCORD LP
 * is worth `rate` corp LP — and an offer's ISK per CONCORD LP is its ISK per
 * LP times the rate. The rate is a per-corp fact ESI does not expose, so it
 * follows a faction rule (issue #2912).
 *
 * The exchange runs only at a station and only converts CONCORD LP held in a
 * Character wallet, never a corporation wallet; that is help text, not modelled.
 */

/** Verified in game: Khanid Innovation, Royal Khanid Navy, Theology Council. 1,000 LP costs 1,250 CONCORD LP. */
export const CONCORD_RATE_EMPIRE = 0.8;

/** ASSUMED from the UniWiki, not verified in game. The UI labels it "assumed". */
export const CONCORD_RATE_OTHER = 0.4;

const EMPIRE_FACTION_IDS: ReadonlySet<number> = new Set([
  500001, 500002, 500003, 500004, 500007, 500008,
]);

/** Intaki, ORE, Thukker, Sisters of EVE, Genolution / SoCT, Mordu's Legion, True Creations. */
const OTHER_FACTION_IDS: ReadonlySet<number> = new Set([
  500009, 500014, 500015, 500016, 500017, 500018, 500019,
]);

/** In the Sisters of EVE faction (500016) yet with no exchange. */
const FOOD_RELIEF_ID = 1000139;
const THE_SANCTUARY_ID = 1000159;

export interface ConcordRate {
  rate: number;
  basis: 'verified' | 'assumed';
}

/** `null` when the corporation has no CONCORD exchange (CONCORD, pirates, Triglavians, EverMark corps, unknown). */
export function concordRate(corp: { id: number; factionId?: number }): ConcordRate | null {
  const { factionId } = corp;
  if (factionId === undefined) return null;
  if (EMPIRE_FACTION_IDS.has(factionId)) return { rate: CONCORD_RATE_EMPIRE, basis: 'verified' };
  if (OTHER_FACTION_IDS.has(factionId)) {
    if (corp.id === FOOD_RELIEF_ID || corp.id === THE_SANCTUARY_ID) return null;
    return { rate: CONCORD_RATE_OTHER, basis: 'assumed' };
  }
  return null;
}

/** CONCORD LP an offer's LP cost takes. */
export function concordLpCost(lpCost: number, rate: number): number {
  return lpCost / rate;
}

/** ISK per CONCORD LP; a missing ISK per LP stays missing. */
export function iskPerConcordLp(iskPerLp: number | null, rate: number): number | null {
  return iskPerLp === null ? null : iskPerLp * rate;
}
