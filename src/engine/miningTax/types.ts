/**
 * Moon Mining Tax ledger domain types (issue #523, CONTEXT.md). Pure shapes
 * only — no fetch/DOM/Dexie (CLAUDE.md).
 */

/** One row from ESI's personal mining ledger (`GET /characters/{id}/mining/`). */
export interface MiningLedgerRow {
  /** EVE/UTC calendar date, e.g. "2026-09-04" — carried verbatim, never reinterpreted through a local timezone. */
  date: string;
  quantity: number;
  solar_system_id: number;
  type_id: number;
}

/** One ore type's summed quantity within a Mining Ledger Entry or an Assignment's slice of one. */
export interface OreLine {
  typeId: number;
  quantity: number;
}

/**
 * One derived Mining Ledger Entry (CONTEXT.md): every moon-goo row ESI
 * reports for one (character, EVE/UTC date, solar system), summed per ore
 * type. Not stored as its own record — re-derived from the ESI ledger on
 * every refresh (decision doc, "Data model").
 */
export interface MiningLedgerEntry {
  characterId: number;
  /** EVE/UTC calendar date, e.g. "2026-09-04". */
  date: string;
  solarSystemId: number;
  /** Sorted by typeId ascending. */
  oreLines: OreLine[];
}

/** Stable key for one Mining Ledger Entry, and for the Assignment(s) covering it. */
export function entryKey(characterId: number, date: string, solarSystemId: number): string {
  return `${characterId}:${date}:${solarSystemId}`;
}

/** One quantity that grew for a `type_id` between an Assignment's snapshot and a fresh ledger read. */
export interface QuantityDiff {
  typeId: number;
  before: number;
  after: number;
}
