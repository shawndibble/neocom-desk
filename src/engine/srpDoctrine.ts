/**
 * SRP doctrine-fit match. Pure, self-contained (no imports) so
 * functions/src/srpDoctrine.ts can mirror it byte for byte.
 *
 * Compares what a killmail's ship was fitted with to a hull's Doctrine Fits:
 * hull, modules (high/mid/low/subsystem) and rigs, by exact type, order ignored.
 * Charges, drones, cargo, implants never count. A mutated (abyssal) module matches
 * a doctrine module that is one of its possible bases.
 */

export type DoctrineRack = 'high' | 'medium' | 'low' | 'rig' | 'subsystem';

/** A corp's snapshot of a fit. Both lists are sorted multisets of type ids (JSON/Firestore friendly). */
export interface DoctrineFitSnapshot {
  hullTypeId: number;
  name: string;
  /** High, mid, low and subsystem modules together; a mutated one is stored as its base. */
  modules: number[];
  rigs: number[];
}

/** What a killmail's ship was fitted with; same shape rules as the snapshot. */
export interface FittedSet {
  hullTypeId: number;
  modules: number[];
  rigs: number[];
}

export interface DoctrineDiff {
  missingModules: number[];
  extraModules: number[];
  missingRigs: number[];
  extraRigs: number[];
}

/** The snapshot stored on a claim at filing. */
export interface DoctrineCheck {
  status: 'not-checked' | 'matched' | 'off-doctrine';
  /** The matched fit, or for off-doctrine the nearest one. */
  doctrineId?: string;
  diff?: DoctrineDiff;
}

export interface DoctrineCandidate {
  id: string;
  fit: DoctrineFitSnapshot;
}

/** An abyssal type's possible base type ids; undefined when the type is not abyssal. */
export type BasesOf = (typeId: number) => readonly number[] | undefined;

export const sortedIds = (ids: readonly number[]): number[] => [...ids].sort((a, b) => a - b);

// ESI inventory flags: LoSlot0 11, MedSlot0 19, HiSlot0 27, RigSlot0 92, SubSystem0 125; 8 each.
const FLAG_RACKS: readonly { rack: DoctrineRack; base: number }[] = [
  { rack: 'low', base: 11 },
  { rack: 'medium', base: 19 },
  { rack: 'high', base: 27 },
  { rack: 'rig', base: 92 },
  { rack: 'subsystem', base: 125 },
];

function rackOfFlag(flag: number): DoctrineRack | null {
  for (const { rack, base } of FLAG_RACKS) if (flag >= base && flag < base + 8) return rack;
  return null;
}

export interface KillmailVictimItems {
  ship_type_id: number;
  items?: {
    item_type_id: number;
    flag: number;
    quantity_destroyed?: number;
    quantity_dropped?: number;
  }[];
}

/**
 * The fitted modules and rigs of a killmail victim; destroyed and dropped both count.
 * A slot flag also holds the module's loaded charge, so an item counts only when
 * `rackOf` (the SDE fitting-slot map) says its type belongs in that flag's rack.
 */
export function killmailFittedSet(
  victim: KillmailVictimItems,
  rackOf: (typeId: number) => string | undefined
): FittedSet {
  const modules: number[] = [];
  const rigs: number[] = [];
  for (const item of victim.items ?? []) {
    const rack = rackOfFlag(item.flag);
    if (rack === null || rackOf(item.item_type_id) !== rack) continue;
    const qty = (item.quantity_destroyed ?? 0) + (item.quantity_dropped ?? 0);
    const into = rack === 'rig' ? rigs : modules;
    for (let i = 0; i < qty; i++) into.push(item.item_type_id);
  }
  return { hullTypeId: victim.ship_type_id, modules: sortedIds(modules), rigs: sortedIds(rigs) };
}

/** `basesOf` from the bundled mutaplasmids.json shape. */
export function basesOfFromData(data: {
  mutaplasmids: Record<string, { result: number; bases: readonly number[] }>;
}): BasesOf {
  const byResult = new Map<number, Set<number>>();
  for (const m of Object.values(data.mutaplasmids)) {
    const set = byResult.get(m.result) ?? new Set<number>();
    for (const b of m.bases) set.add(b);
    byResult.set(m.result, set);
  }
  return (typeId) => {
    const set = byResult.get(typeId);
    return set ? [...set] : undefined;
  };
}

/** Pairs killmail items to doctrine items; returns what each side has left over. */
function diffMultiset(
  killed: readonly number[],
  wanted: readonly number[],
  basesOf?: BasesOf
): { missing: number[]; extra: number[] } {
  const wantedLeft = [...wanted];
  const killedLeft: number[] = [];
  // Exact types first: never worse than any other pairing.
  for (const t of killed) {
    const i = wantedLeft.indexOf(t);
    if (i >= 0) wantedLeft.splice(i, 1);
    else killedLeft.push(t);
  }
  // Mutated leftovers: bipartite matching onto the doctrine's remaining modules.
  const matchOf: number[] = wantedLeft.map(() => -1); // doctrine idx -> killed idx
  const canBe = (k: number, w: number): boolean =>
    basesOf?.(killedLeft[k])?.includes(wantedLeft[w]) ?? false;
  const augment = (k: number, seen: Set<number>): boolean => {
    for (let w = 0; w < wantedLeft.length; w++) {
      if (seen.has(w) || !canBe(k, w)) continue;
      seen.add(w);
      if (matchOf[w] < 0 || augment(matchOf[w], seen)) {
        matchOf[w] = k;
        return true;
      }
    }
    return false;
  };
  for (let k = 0; k < killedLeft.length; k++) augment(k, new Set());
  const used = new Set(matchOf.filter((k) => k >= 0));
  return {
    missing: wantedLeft.filter((_, w) => matchOf[w] < 0),
    extra: killedLeft.filter((_, k) => !used.has(k)),
  };
}

function diffAgainst(
  fit: FittedSet,
  doctrine: DoctrineFitSnapshot,
  basesOf?: BasesOf
): DoctrineDiff {
  const m = diffMultiset(fit.modules, doctrine.modules, basesOf);
  const r = diffMultiset(fit.rigs, doctrine.rigs);
  return {
    missingModules: sortedIds(m.missing),
    extraModules: sortedIds(m.extra),
    missingRigs: sortedIds(r.missing),
    extraRigs: sortedIds(r.extra),
  };
}

const diffSize = (d: DoctrineDiff): number =>
  d.missingModules.length + d.extraModules.length + d.missingRigs.length + d.extraRigs.length;

/**
 * Checks a killmail's fit against the Doctrine Fits of its hull. No fit for the hull:
 * 'not-checked'. Any one exact match: 'matched' with that fit. Otherwise
 * 'off-doctrine' with the diff against the nearest fit (fewest differences; first on a tie).
 */
export function matchDoctrine(
  fitted: FittedSet,
  doctrines: readonly DoctrineCandidate[],
  basesOf?: BasesOf
): DoctrineCheck {
  const ofHull = doctrines.filter((d) => d.fit.hullTypeId === fitted.hullTypeId);
  if (ofHull.length === 0) return { status: 'not-checked' };
  let best: { id: string; diff: DoctrineDiff } | null = null;
  for (const d of ofHull) {
    const diff = diffAgainst(fitted, d.fit, basesOf);
    if (diffSize(diff) === 0) return { status: 'matched', doctrineId: d.id };
    if (best === null || diffSize(diff) < diffSize(best.diff)) best = { id: d.id, diff };
  }
  return { status: 'off-doctrine', doctrineId: best!.id, diff: best!.diff };
}
