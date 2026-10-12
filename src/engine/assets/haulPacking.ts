/**
 * Haul packing: which items ride in which hold of a hauler, haul by haul.
 *
 * First-fit decreasing over whole units. A stack may split across holds and
 * hauls, but one unit never does: a packaged ship has to fit one hold on its
 * own, so a hull whose biggest hold is smaller than the unit cannot carry it
 * at all. Pure — the caller names the holds and the per-unit volumes.
 */

/** The two holds that take any item. Specialised Holds are left out (see `cargoHolds.ts`). */
export type PackHoldKind = 'cargo' | 'fleetHangar';

export interface PackHold {
  kind: PackHoldKind;
  capacityM3: number;
}

export interface PackLine {
  typeId: number;
  quantity: number;
  /** m³ of one unit as hauled. */
  unitM3: number;
}

export interface HoldLoad {
  kind: PackHoldKind;
  capacityM3: number;
  usedM3: number;
  lines: { typeId: number; quantity: number; m3: number }[];
}

export interface Haul {
  /** Largest hold first. */
  holds: HoldLoad[];
  usedM3: number;
}

export interface PackResult {
  hauls: Haul[];
  /** Stacks whose single unit is bigger than the hull's biggest hold; never divided. */
  unfit: PackLine[];
}

const EPS = 1e-9;

function newHaul(holds: readonly PackHold[]): Haul {
  return {
    holds: holds.map((h) => ({ kind: h.kind, capacityM3: h.capacityM3, usedM3: 0, lines: [] })),
    usedM3: 0,
  };
}

/** Puts as many of `left` units as fit into `hold`; returns how many went in. */
function load(haul: Haul, hold: HoldLoad, line: PackLine, left: number): number {
  const room = hold.capacityM3 - hold.usedM3;
  const n = line.unitM3 > 0 ? Math.min(left, Math.floor(room / line.unitM3 + EPS)) : left;
  if (n <= 0) return 0;
  const m3 = n * line.unitM3;
  hold.lines.push({ typeId: line.typeId, quantity: n, m3 });
  hold.usedM3 += m3;
  haul.usedM3 += m3;
  return n;
}

export function packHauls(lines: readonly PackLine[], holds: readonly PackHold[]): PackResult {
  const usable = holds
    .filter((h) => h.capacityM3 > 0)
    // Equal holds: the fleet hangar first, so the cargo hold stays free for loose stock.
    .sort(
      (a, b) =>
        b.capacityM3 - a.capacityM3 ||
        Number(b.kind === 'fleetHangar') - Number(a.kind === 'fleetHangar')
    );
  const biggest = usable[0]?.capacityM3 ?? 0;
  const hauls: Haul[] = [];
  const unfit: PackLine[] = [];

  const ordered = lines
    .filter((l) => l.quantity > 0)
    .sort((a, b) => b.unitM3 - a.unitM3 || a.typeId - b.typeId);

  for (const line of ordered) {
    if (line.unitM3 > biggest + EPS) {
      unfit.push(line);
      continue;
    }
    let left = line.quantity;
    for (const haul of hauls) {
      for (const hold of haul.holds) {
        left -= load(haul, hold, line, left);
        if (left === 0) break;
      }
      if (left === 0) break;
    }
    while (left > 0) {
      const haul = newHaul(usable);
      let placed = 0;
      for (const hold of haul.holds) {
        placed += load(haul, hold, line, left - placed);
        if (placed === left) break;
      }
      if (placed === 0) {
        // Float edge: the unit is a hair over the biggest hold. Never loop on it.
        unfit.push({ ...line, quantity: left });
        break;
      }
      hauls.push(haul);
      left -= placed;
    }
  }
  return { hauls, unfit };
}
