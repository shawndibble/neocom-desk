/**
 * Real EVE ids, so the SDE snapshot in `public/data` resolves every name and
 * `images.evetech.net` serves every icon. A made-up typeID renders as a blank
 * tile and an "Unknown type" row, which is the one thing a showcase PNG
 * cannot afford.
 */

export const STATION = {
  jita44: 60003760,
  amarrEFA: 60008494,
  dodixieFNAP: 60011866,
  renImperial: 60004588,
} as const;

export const SYSTEM = {
  jita: 30000142,
  amarr: 30002187,
  dodixie: 30002659,
  perimeter: 30000144,
  hek: 30002053,
} as const;

export const REGION = {
  theForge: 10000002,
  domain: 10000043,
  sinqLaison: 10000032,
  heimatar: 10000030,
  metropolis: 10000042,
} as const;

/** Ships, minerals and components — all real typeIDs from public/data/types.json. */
export const TYPE = {
  tritanium: 34,
  pyerite: 35,
  mexallon: 36,
  isogen: 37,
  nocxium: 38,
  zydrine: 39,
  megacyte: 40,
  rifter: 587,
  caracal: 621,
  vexor: 626,
  raven: 638,
  dominix: 645,
  ishtar: 12005,
  muninn: 12015,
  retriever: 17478,
  hulk: 22544,
  drake: 24698,
  tengu: 29984,
  loki: 29990,
  praxis: 47466,
} as const;

/**
 * Real blueprint typeIDs, resolved out of `public/data/blueprints.json` by
 * matching each entry's manufacturing product — they are NOT productTypeID+1,
 * which is a coincidence for a few hulls and wrong for most (Raven's is 688,
 * Vexor's 971), and a wrong id silently renders somebody else's ship.
 */
export const BLUEPRINT = {
  raven: 688,
  ishtar: 12006,
  muninn: 12016,
  vexor: 971,
  caracal: 687,
  hulk: 22545,
  retriever: 17479,
  drake: 24699,
} as const;

/** Skill typeIDs from public/data/skills.json. */
export const SKILL = {
  gallenteBattleship: 39,
  caldariBattleship: 41,
  industry: 66,
  mining: 68,
  massProduction: 69,
  advancedIndustry: 70,
  science: 80,
  research: 81,
  laboratoryOperation: 83,
  metallurgy: 85,
  astrogeology: 86,
  trade: 117,
  retail: 118,
  brokerRelations: 119,
  visibility: 120,
  procurement: 205,
  daytrading: 206,
  wholesale: 207,
  marketing: 209,
  accounting: 210,
  miningBarge: 211,
  tycoon: 213,
  capitalShipConstruction: 259,
  exhumers: 262,
  supplyChainManagement: 282,
  advancedMassProduction: 296,
  reactions: 408,
  massReactions: 409,
} as const;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const hoursAgo = (n: number): string => new Date(Date.now() - n * HOUR_MS).toISOString();
export const hoursAhead = (n: number): string => new Date(Date.now() + n * HOUR_MS).toISOString();
export const daysAgo = (n: number): string => new Date(Date.now() - n * DAY_MS).toISOString();
export const daysAhead = (n: number): string => new Date(Date.now() + n * DAY_MS).toISOString();
export const msDaysAhead = (n: number): number => Date.now() + n * DAY_MS;
/** `YYYY-MM-DD`, the shape a mining-ledger row's `date` carries. */
export const dayStamp = (n: number): string =>
  new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
