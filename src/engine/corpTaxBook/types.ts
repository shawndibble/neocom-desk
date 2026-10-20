/**
 * Corp Tax Book domain shapes (issue #4059, epic #4055, GLOSSARY.md). Pure
 * shapes only — no fetch/DOM/Dexie/Firebase (CLAUDE.md).
 *
 * Dates are bare EVE/UTC calendar dates ("2026-07-12"), carried verbatim the
 * way the personal ledger carries them; instants are ISO-8601 UTC strings.
 */
import type { OreLine } from '../miningTax/types';

export type { OreLine };

/**
 * One row of `GET /corporation/{id}/mining/observers/{observer_id}` as the book
 * stores it: one character, one ore type, one day, at one refinery. Its
 * quantity keeps growing during the day.
 */
export interface ObservedRow {
  /** The refinery (Athanor/Tatara) — ESI's `observer_id`. */
  structureId: number;
  characterId: number;
  /** The miner's corporation when the ore was mined — tells a member from a guest. */
  recordedCorporationId: number;
  typeId: number;
  /** ESI's `last_updated`: the EVE/UTC day this row is for. */
  date: string;
  quantity: number;
  /** When the ESI response that carried this row was generated (its cache time). */
  cachedAt: string;
  /**
   * The system the refinery is in, when the syncing officer's client knew it.
   * A member's personal ledger knows only the system, so this is what lets
   * the personal tab line a book row up with its Mining Ledger Entry (#4065).
   */
  solarSystemId?: number;
  /** The moon the refinery was drilling that day, when known — for per-moon rates. */
  moonId?: number;
  /**
   * The feeder corporation whose refinery recorded the row. Absent means the
   * book's own corporation, so every existing book reads as before.
   */
  sourceCorporationId?: number;
}

/**
 * One Observed Mining Entry (GLOSSARY.md): everything one character mined at
 * one refinery on one EVE/UTC date, summed per ore type.
 */
export interface ObservedMiningEntry {
  characterId: number;
  recordedCorporationId: number;
  structureId: number;
  date: string;
  solarSystemId?: number;
  moonId?: number;
  /** Raw ore types, sorted by typeId ascending. */
  oreLines: OreLine[];
}
