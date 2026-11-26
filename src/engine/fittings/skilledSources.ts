import type { AffectedSource } from './affectedBy';

export type SkilledSourceKind = 'skill' | 'implant' | 'hull';

export interface SkilledSource {
  kind: SkilledSourceKind;
  typeId: number;
}

const ORDER: Readonly<Record<SkilledSourceKind, number>> = { skill: 0, implant: 1, hull: 2 };

export function skilledSourcesOf(
  sources: readonly AffectedSource[],
  pilot: { implantTypeIds: readonly number[] }
): SkilledSource[] {
  const implants = new Set(pilot.implantTypeIds);
  const seen = new Set<string>();
  const out: SkilledSource[] = [];
  for (const source of sources) {
    if (!source.applied || source.typeId === null) continue;
    const kind: SkilledSourceKind | null =
      source.kind === 'skill'
        ? 'skill'
        : source.kind === 'ship'
          ? 'hull'
          : source.kind === 'item' && implants.has(source.typeId)
            ? 'implant'
            : null;
    if (!kind) continue;
    const key = `${kind}:${source.typeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, typeId: source.typeId });
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
