/**
 * What made one of Item Detail's skilled values ("base → skilled"): the
 * pilot's skills, their implants, and the hull's own per-level bonus, read
 * off the engine's resolved modifier sources (`affectedAttributes`). Each
 * named once, skills first. A source that didn't apply, the item itself, or
 * the character's own attributes say nothing the pilot can act on and are
 * left out. Pure.
 */
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
