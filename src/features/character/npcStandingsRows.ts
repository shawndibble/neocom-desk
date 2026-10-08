/**
 * Row model for the Contacts page's Standings tab (issue #2859): the
 * Character's NPC faction / corp / agent standings, with the ones the app
 * applies to broker fees flagged. Pure — names and entries come in resolved.
 *
 * Only Trade Hub owners are flagged: every other NPC station uses its own
 * owner, which is not enumerable up front. Agents are never a fee input.
 * The match is by id alone, as `resolveOwnerStandings` does.
 */
import type { CharacterStandingEntry } from '@/engine/market/standings';
import { TRADE_HUBS } from '@/market/hubs';

export type NpcStandingKind = 'faction' | 'corp' | 'agent';

export interface NpcStandingRow {
  id: number;
  name: string;
  kind: NpcStandingKind;
  standing: number;
  usedForFees: boolean;
}

const KIND: Record<CharacterStandingEntry['from_type'], NpcStandingKind> = {
  faction: 'faction',
  npc_corp: 'corp',
  agent: 'agent',
};

/** Owner corporation and faction ids of every Trade Hub. */
export function feeOwnerIds(): ReadonlySet<number> {
  return new Set(TRADE_HUBS.flatMap((hub) => [hub.ownerCorporationId, hub.ownerFactionId]));
}

/** Highest standing first. */
export function buildNpcStandingRows(
  entries: readonly CharacterStandingEntry[],
  names: ReadonlyMap<number, string>,
  feeOwners: ReadonlySet<number>
): NpcStandingRow[] {
  return entries
    .map((entry) => ({
      id: entry.from_id,
      name: names.get(entry.from_id) ?? `#${entry.from_id}`,
      kind: KIND[entry.from_type],
      standing: entry.standing,
      usedForFees: entry.from_type !== 'agent' && feeOwners.has(entry.from_id),
    }))
    .sort((a, b) => b.standing - a.standing);
}

/** Name or numeric id substring, as `filterContacts` matches. */
export function filterNpcStandingRows(
  rows: readonly NpcStandingRow[],
  text: string
): NpcStandingRow[] {
  const needle = text.trim().toLowerCase();
  if (needle === '') return [...rows];
  return rows.filter(
    (row) => row.name.toLowerCase().includes(needle) || String(row.id).includes(needle)
  );
}
