export type DoctrineRack = 'high' | 'medium' | 'low' | 'rig' | 'subsystem';

export interface DoctrineFitSnapshot {
  hullTypeId: number;
  name: string;
  modules: number[];
  rigs: number[];
}

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

export interface DoctrineCheck {
  status: 'not-checked' | 'matched' | 'off-doctrine';
  doctrineId?: string;
  diff?: DoctrineDiff;
}

export interface DoctrineCandidate {
  id: string;
  fit: DoctrineFitSnapshot;
}

export type BasesOf = (typeId: number) => readonly number[] | undefined;

export const sortedIds = (ids: readonly number[]): number[] => [...ids].sort((a, b) => a - b);

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

function diffMultiset(
  killed: readonly number[],
  wanted: readonly number[],
  basesOf?: BasesOf
): { missing: number[]; extra: number[] } {
  const wantedLeft = [...wanted];
  const killedLeft: number[] = [];
  for (const t of killed) {
    const i = wantedLeft.indexOf(t);
    if (i >= 0) wantedLeft.splice(i, 1);
    else killedLeft.push(t);
  }
  const matchOf: number[] = wantedLeft.map(() => -1);
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
