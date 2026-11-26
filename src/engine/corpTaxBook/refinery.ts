import type { MiningLedgerEntry } from '../miningTax/types';
import type { ObservedMiningEntry, ObservedRow } from './types';

export function sourceCorporationOf(
  row: Pick<ObservedRow, 'sourceCorporationId'>,
  bookCorporationId: number
): number {
  return row.sourceCorporationId ?? bookCorporationId;
}

export interface OfficerLabel {
  label: string;
  setAt: string;
}

export interface RefineryLabelInput {
  structureId: number;
  officerLabels?: readonly OfficerLabel[];
  structureName?: string;
  systemName?: string;
  feederName?: string;
}

export type RefineryLabelSource = 'officer' | 'structure' | 'system' | 'feeder' | 'id';

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

export interface RefineryLabelSources {
  officerLabels?: (structureId: number) => readonly OfficerLabel[] | undefined;
  structureName?: (structureId: number) => string | undefined;
  systemName?: (structureId: number) => string | undefined;
  ownerName?: (structureId: number) => string | undefined;
  fallback?: (structureId: number) => string;
}

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

export interface StoredRefineryStructure {
  name?: string;
  solarSystemId?: number;
  checkedAt: number;
  denied?: boolean;
}

interface MoonOwnerRefineryFacts {
  refinerySystems?: Readonly<Record<string, number>>;
  refineryStructures?: Readonly<Record<string, StoredRefineryStructure>>;
}

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

export function structureNamesOf(feeders: readonly MoonOwnerRefineryFacts[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const f of feeders)
    for (const [id, s] of Object.entries(f.refineryStructures ?? {})) {
      if (s.name && !names.has(Number(id))) names.set(Number(id), s.name);
    }
  return names;
}

export interface StoredRefineryLabel extends OfficerLabel {
  setBy?: number;
  side?: 'accounting' | 'moon-owner';
}

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

export function ownerRefinerySystemsToLearn(
  entries: readonly ObservedMiningEntry[],
  personal: readonly MiningLedgerEntry[]
): Record<number, number> {
  return learnRefinerySystems(
    entries.filter((e) => e.sourceCorporationId !== undefined && e.solarSystemId === undefined),
    personal
  );
}
