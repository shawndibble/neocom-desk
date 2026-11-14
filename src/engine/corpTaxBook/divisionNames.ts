/**
 * The corp's own names for its wallet divisions, as a Corp Tax Book stores them (#6161).
 *
 * A member cannot read `/corporations/{id}/divisions` (Director only), so a Director's own
 * login reads them when they open the book and pushes the names of the book's divisions
 * through `updateSettings` (`divisionNames`). The member's Settle up then names the Account
 * to pick in EVE's Transfer ISK window. Pure: the reads and the push live in the client.
 */
import { isPlainRecord } from '@/engine/guards';

/** Mirrors `DIVISION_NAME_MAX` in `functions/src/corpTaxBookEngine.ts` (functionsMirror.test.ts). */
export const DIVISION_NAME_MAX = 50;

/** Division number to name. */
export type DivisionNames = Record<number, string>;

/** The stored `divisionNames` map, tolerant of absence and garbage. */
export function readDivisionNames(value: unknown): DivisionNames {
  if (!isPlainRecord(value)) return {};
  const names: DivisionNames = {};
  for (const [key, name] of Object.entries(value)) {
    if (!/^[1-7]$/.test(key) || typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed) names[Number(key)] = trimmed;
  }
  return names;
}

/**
 * What a Director's visit should push: the names `read` gives the book's `divisions`, or null
 * when the book already holds exactly those. A division the corp never named, or named past
 * the book's bound, is left out (the member sees the numbered fallback).
 */
export function divisionNamesToPush(
  divisions: readonly number[],
  stored: Readonly<DivisionNames> | undefined,
  read: readonly { division?: number; name?: string }[]
): DivisionNames | null {
  const next: DivisionNames = {};
  for (const entry of read) {
    const name = entry.name?.trim();
    if (
      entry.division !== undefined &&
      divisions.includes(entry.division) &&
      name &&
      name.length <= DIVISION_NAME_MAX
    ) {
      next[entry.division] = name;
    }
  }
  const keys = Object.keys(next);
  const same =
    keys.length === Object.keys(stored ?? {}).length &&
    keys.every((k) => stored?.[Number(k)] === next[Number(k)]);
  return same ? null : next;
}
