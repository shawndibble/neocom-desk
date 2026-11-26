export type PackHoldKind = 'cargo' | 'fleetHangar';

export interface PackHold {
  kind: PackHoldKind;
  capacityM3: number;
}

export interface PackLine {
  typeId: number;
  quantity: number;
  unitM3: number;
  unitIsk?: number;
}

export interface HoldLoad {
  kind: PackHoldKind;
  capacityM3: number;
  usedM3: number;
  lines: { typeId: number; quantity: number; m3: number }[];
}

export interface Haul {
  holds: HoldLoad[];
  usedM3: number;
  iskValue: number;
}

export interface PackResult {
  hauls: Haul[];
  unfit: PackLine[];
  overLimit: PackLine[];
}

const EPS = 1e-9;

function newHaul(holds: readonly PackHold[]): Haul {
  return {
    holds: holds.map((h) => ({ kind: h.kind, capacityM3: h.capacityM3, usedM3: 0, lines: [] })),
    usedM3: 0,
    iskValue: 0,
  };
}

function load(
  haul: Haul,
  hold: HoldLoad,
  line: PackLine,
  left: number,
  maxIsk: number | null
): number {
  const room = hold.capacityM3 - hold.usedM3;
  let n = line.unitM3 > 0 ? Math.min(left, Math.floor(room / line.unitM3 + EPS)) : left;
  const unitIsk = line.unitIsk ?? 0;
  if (maxIsk !== null && unitIsk > 0)
    n = Math.min(n, Math.floor((maxIsk - haul.iskValue) / unitIsk + EPS));
  if (n <= 0) return 0;
  const m3 = n * line.unitM3;
  hold.lines.push({ typeId: line.typeId, quantity: n, m3 });
  hold.usedM3 += m3;
  haul.usedM3 += m3;
  haul.iskValue += n * unitIsk;
  return n;
}

export function normalizeMaxIsk(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function packHauls(
  lines: readonly PackLine[],
  holds: readonly PackHold[],
  maxIsk?: number | null
): PackResult {
  const limit = normalizeMaxIsk(maxIsk);
  const usable = holds
    .filter((h) => h.capacityM3 > 0)
    .sort(
      (a, b) =>
        b.capacityM3 - a.capacityM3 ||
        Number(b.kind === 'fleetHangar') - Number(a.kind === 'fleetHangar')
    );
  const biggest = usable[0]?.capacityM3 ?? 0;
  const hauls: Haul[] = [];
  const unfit: PackLine[] = [];
  const overLimit: PackLine[] = [];

  const ordered = lines
    .filter((l) => l.quantity > 0)
    .sort((a, b) => b.unitM3 - a.unitM3 || a.typeId - b.typeId);

  for (const line of ordered) {
    if (line.unitM3 > biggest + EPS) {
      unfit.push(line);
      continue;
    }
    if (limit !== null && (line.unitIsk ?? 0) > limit + EPS) {
      overLimit.push(line);
      continue;
    }
    let left = line.quantity;
    for (const haul of hauls) {
      for (const hold of haul.holds) {
        left -= load(haul, hold, line, left, limit);
        if (left === 0) break;
      }
      if (left === 0) break;
    }
    while (left > 0) {
      const haul = newHaul(usable);
      let placed = 0;
      for (const hold of haul.holds) {
        placed += load(haul, hold, line, left - placed, limit);
        if (placed === left) break;
      }
      if (placed === 0) {
        unfit.push({ ...line, quantity: left });
        break;
      }
      hauls.push(haul);
      left -= placed;
    }
  }
  return { hauls, unfit, overLimit };
}
