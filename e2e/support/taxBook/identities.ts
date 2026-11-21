/**
 * The people in the Corp Tax Book specs. The officer is the suite's one signed-in Character
 * (`fixtureData.ts`); the Miners are names the browser's ESI mock and the specs share.
 *
 * The corporation rule is the one `scripts/e2e-book/ccpStub.mjs` answers the server with: every
 * Character is in the officer's corporation, except ids from `LEFT_FROM` up. Those from
 * `LEFT_FROM` to `OUTSIDE_FROM` mined as members and have since left (`recordedCorpOf` is still
 * the corporation); those from `OUTSIDE_FROM` up were never in it (guests).
 */
import { CHARACTER_ID, CHARACTER_NAME, CORPORATION_ID, OWNER_HASH } from '../fixtureData';

export const OFFICER = { id: CHARACTER_ID, name: CHARACTER_NAME, ownerHash: OWNER_HASH };
export const CORP = CORPORATION_ID;
export const OUTSIDE_CORP = 98_999_999;
const LEFT_FROM = 90_008_000;
const OUTSIDE_FROM = 90_009_000;

export const MINER = {
  ada: { id: 90_000_101, name: 'Ada Lunar' },
  bram: { id: 90_000_102, name: 'Bram Kessik' },
  cora: { id: 90_000_103, name: 'Cora Vell' },
  dax: { id: 90_000_104, name: 'Dax Orlov' },
  /** Dax's alt: grouped with Dax, so their days and money are one account. */
  daxAlt: { id: 90_000_105, name: 'Orlov Hauler' },
  eli: { id: 90_000_106, name: 'Eli Brask' },
  fen: { id: 90_000_107, name: 'Fen Corvane' },
  /** The signed-in pilot's alt (phase 2): grouped with the pilot in their corporation's book. */
  pilotAlt: { id: 90_000_120, name: 'Test Pilot Hauler' },
  /** A player the pilot pays moon tax to directly: a personal Payee (phase 2). */
  rook: { id: 90_000_130, name: 'Rook Belter' },
  /** Mined as a member, then left the corporation owing: a leaver. */
  lev: { id: 90_008_001, name: 'Lev Departed' },
  /** Mines in the book's refineries from another corporation: a guest, paid on the verify page. */
  guest: { id: 90_009_001, name: 'Gale Outsider' },
} as const;

export type MinerKey = keyof typeof MINER;

const NAMES = new Map<number, string>([
  [OFFICER.id, OFFICER.name],
  ...Object.values(MINER).map((m) => [m.id, m.name] as const),
]);

export const nameOf = (id: number): string => NAMES.get(id) ?? `Pilot ${id}`;
/** The corporation a Character is in now (ESI's affiliation). */
export const corpOf = (id: number): number => (id >= LEFT_FROM ? OUTSIDE_CORP : CORP);
/** The corporation the refinery's ledger recorded them in when they mined. */
export const recordedCorpOf = (id: number): number => (id >= OUTSIDE_FROM ? OUTSIDE_CORP : CORP);
/** A Miner's id as the book keys an ungrouped Character. */
export const solo = (id: number): string => `solo:${id}`;
