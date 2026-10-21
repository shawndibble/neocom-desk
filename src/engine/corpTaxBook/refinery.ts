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
  /** The system, from an observed row or learned from a miner's own ledger. */
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

/**
 * Each refinery's system (a row's, else one learned from a miner's own ledger)
 * and its moon owner (absent: the book's own).
 */
export function refineryFacts(
  rows: readonly Pick<ObservedRow, 'structureId' | 'solarSystemId' | 'sourceCorporationId'>[],
  learnedSystems?: ReadonlyMap<number, number>
): { systemOf: Map<number, number>; sourceOf: Map<number, number> } {
  const systemOf = new Map<number, number>();
  const sourceOf = new Map<number, number>();
  for (const r of rows) {
    if (r.solarSystemId !== undefined && !systemOf.has(r.structureId)) {
      systemOf.set(r.structureId, r.solarSystemId);
    }
    if (r.sourceCorporationId !== undefined) sourceOf.set(r.structureId, r.sourceCorporationId);
  }
  for (const [structureId, system] of learnedSystems ?? []) {
    if (!systemOf.has(structureId)) systemOf.set(structureId, system);
  }
  return { systemOf, sourceOf };
}

/**
 * What the server's `/universe/structures` lookup read for one moon owner refinery (#4654),
 * with the moon owner's own token. `denied`: ESI said 403 or 404 (no docking access, gone).
 */
export interface StoredRefineryStructure {
  name?: string;
  solarSystemId?: number;
  /** When it was last looked up (ms). */
  checkedAt: number;
  denied?: boolean;
}

interface MoonOwnerRefineryFacts {
  refinerySystems?: Readonly<Record<string, number>>;
  refineryStructures?: Readonly<Record<string, StoredRefineryStructure>>;
}

/**
 * Each moon owner refinery's system, from their records, by structure id: the one the structure
 * lookup read wins over the one learned from a miner's own ledger (#4654).
 */
export function learnedSystemsOf(feeders: readonly MoonOwnerRefineryFacts[]): Map<number, number> {
  const systems = new Map<number, number>();
  for (const f of feeders) {
    for (const [id, s] of Object.entries(f.refineryStructures ?? {})) {
      if (s.solarSystemId !== undefined && !systems.has(Number(id))) {
        systems.set(Number(id), s.solarSystemId);
      }
    }
    for (const [id, system] of Object.entries(f.refinerySystems ?? {})) {
      if (!systems.has(Number(id))) systems.set(Number(id), system);
    }
  }
  return systems;
}

/** The structure names the lookups read for the moon owners' refineries, by structure id. */
export function structureNamesOf(feeders: readonly MoonOwnerRefineryFacts[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const f of feeders)
    for (const [id, s] of Object.entries(f.refineryStructures ?? {})) {
      if (s.name && !names.has(Number(id))) names.set(Number(id), s.name);
    }
  return names;
}

/** A label stored on a moon owner's record, keyed by structure id. */
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
 * most common system wins; a tie learns nothing (a kept system never moves).
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
    const [first, second] = [...tally].sort((a, b) => b[1] - a[1]);
    if (second && second[1] === first[1]) continue;
    learned[structureId] = first[0];
  }
  return learned;
}

/**
 * What a miner's own ledger can teach the book: the systems of moon owner
 * refineries whose rows carry none (a moon owner's grant is ledger-only).
 */
export function ownerRefinerySystemsToLearn(
  entries: readonly ObservedMiningEntry[],
  personal: readonly MiningLedgerEntry[]
): Record<number, number> {
  return learnRefinerySystems(
    entries.filter((e) => e.sourceCorporationId !== undefined && e.solarSystemId === undefined),
    personal
  );
}
