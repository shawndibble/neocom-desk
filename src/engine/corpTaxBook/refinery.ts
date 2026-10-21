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

/**
 * What a screen knows about each refinery, by structure id. `ownerName` is for
 * officer and moon owner screens only: a miner's line never names the moon owner.
 */
export interface RefineryLabelSources {
  officerLabels?: (structureId: number) => readonly OfficerLabel[] | undefined;
  structureName?: (structureId: number) => string | undefined;
  systemName?: (structureId: number) => string | undefined;
  ownerName?: (structureId: number) => string | undefined;
  /** What a refinery with nothing known reads as; the plain id when absent. */
  fallback?: (structureId: number) => string;
}

/** Every refinery cell through `refineryLabel`, from one screen's sources. */
export function refineryLabeler(sources: RefineryLabelSources): (structureId: number) => string {
  return (structureId) => {
    const officerLabels = sources.officerLabels?.(structureId);
    const structureName = sources.structureName?.(structureId);
    const systemName = sources.systemName?.(structureId);
    const feederName = sources.ownerName?.(structureId);
    const { label, source } = refineryLabel({
      structureId,
      ...(officerLabels ? { officerLabels } : {}),
      ...(structureName ? { structureName } : {}),
      ...(systemName ? { systemName } : {}),
      ...(feederName ? { feederName } : {}),
    });
    return source === 'id' && sources.fallback ? sources.fallback(structureId) : label;
  };
}

/** Each refinery's system (when a row carried it) and its moon owner (absent: the book's own). */
export function refineryFacts(
  rows: readonly Pick<ObservedRow, 'structureId' | 'solarSystemId' | 'sourceCorporationId'>[]
): { systemOf: Map<number, number>; sourceOf: Map<number, number> } {
  const systemOf = new Map<number, number>();
  const sourceOf = new Map<number, number>();
  for (const r of rows) {
    if (r.solarSystemId !== undefined && !systemOf.has(r.structureId)) {
      systemOf.set(r.structureId, r.solarSystemId);
    }
    if (r.sourceCorporationId !== undefined) sourceOf.set(r.structureId, r.sourceCorporationId);
  }
  return { systemOf, sourceOf };
}

/** A label stored on a moon owner's record, keyed by structure id: one per refinery, last edit wins. */
export interface StoredRefineryLabel extends OfficerLabel {
  setBy?: number;
  side?: 'accounting' | 'moon-owner';
}

/** The officer labels on the moon owners' records, by structure id. */
export function officerLabelsOf(
  feeders: readonly { refineryLabels?: Readonly<Record<string, StoredRefineryLabel>> }[]
): Map<number, OfficerLabel[]> {
  const labels = new Map<number, OfficerLabel[]>();
  for (const f of feeders)
    for (const [id, l] of Object.entries(f.refineryLabels ?? {})) {
      const key = Number(id);
      labels.set(key, [...(labels.get(key) ?? []), { label: l.label, setAt: l.setAt }]);
    }
  return labels;
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
