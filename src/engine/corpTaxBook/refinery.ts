/**
 * Where an observed row came from and what to call its refinery. A refinery's
 * identity is its structure id, so two refineries never merge even in one
 * system on one day; the label is only for people to read.
 */
import type { MiningLedgerEntry } from '../miningTax/types';
import type { ObservedMiningEntry, ObservedRow } from './types';

/** The corporation whose refinery recorded the row; absent means the book's own corporation. */
export function sourceCorporationOf(
  row: Pick<ObservedRow, 'sourceCorporationId'>,
  bookCorporationId: number
): number {
  return row.sourceCorporationId ?? bookCorporationId;
}

export interface OfficerLabel {
  label: string;
  /** ISO instant of the edit; the latest wins, from either side's officers. */
  setAt: string;
}

export interface RefineryLabelInput {
  structureId: number;
  officerLabels?: readonly OfficerLabel[];
  /** The structure's name, when ESI let us read it. */
  structureName?: string;
  /** The system, learned from the miner's own character ledger. */
  systemName?: string;
  /** The feeder corporation's name. */
  feederName?: string;
}

export type RefineryLabelSource = 'officer' | 'structure' | 'system' | 'feeder' | 'id';

/**
 * First that works: an officer's free-text label (last edit wins), the
 * structure name, the learned system, then the feeder's name plus the
 * structure id so two refineries never look alike.
 */
export function refineryLabel(input: RefineryLabelInput): {
  label: string;
  source: RefineryLabelSource;
} {
  const edits = (input.officerLabels ?? []).filter((e) => e.label.trim() !== '');
  const latest = edits.reduce<OfficerLabel | undefined>(
    (best, e) => (!best || Date.parse(e.setAt) > Date.parse(best.setAt) ? e : best),
    undefined
  );
  if (latest) return { label: latest.label.trim(), source: 'officer' };
  if (input.structureName) return { label: input.structureName, source: 'structure' };
  if (input.systemName) return { label: input.systemName, source: 'system' };
  if (input.feederName) {
    return { label: `${input.feederName} ${input.structureId}`, source: 'feeder' };
  }
  return { label: String(input.structureId), source: 'id' };
}

const sameOre = (a: ObservedMiningEntry['oreLines'], b: MiningLedgerEntry['oreLines']) =>
  a.length === b.length &&
  a.every((l, i) => l.typeId === b[i].typeId && l.quantity === b[i].quantity);

/**
 * Learns each refinery's system by matching its entries (same character, day
 * and ore) against the miner's own ledger entries. When matches disagree the
 * most common system wins; a tie goes to the lowest id.
 */
export function learnRefinerySystems(
  entries: readonly ObservedMiningEntry[],
  personal: readonly MiningLedgerEntry[]
): Record<number, number> {
  const votes = new Map<number, Map<number, number>>();
  for (const entry of entries) {
    for (const own of personal) {
      if (
        own.characterId !== entry.characterId ||
        own.date !== entry.date ||
        !sameOre(entry.oreLines, own.oreLines)
      ) {
        continue;
      }
      const tally = votes.get(entry.structureId) ?? new Map<number, number>();
      tally.set(own.solarSystemId, (tally.get(own.solarSystemId) ?? 0) + 1);
      votes.set(entry.structureId, tally);
    }
  }
  const learned: Record<number, number> = {};
  for (const [structureId, tally] of votes) {
    const [system] = [...tally].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    learned[structureId] = system;
  }
  return learned;
}
