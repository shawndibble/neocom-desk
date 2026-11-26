import { splitChunkVariants, sumByType } from './moonOreVariants';

export interface OreQty {
  typeId: number;
  quantity: number;
}

export interface OreLossRow {
  typeId: number;
  chunk: number;
  mined: number;
  lost: number;
  pct: number;
}

export interface MoonLoss {
  kind: 'residue' | 'combined';
  rows: OreLossRow[];
  totalPct: number;
}

const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function moonLoss(
  chunk: readonly OreQty[],
  mined: readonly OreQty[],
  fullyMined: boolean
): MoonLoss | null {
  if (chunk.length === 0) return null;
  const got = sumByType(mined);
  const rows = splitChunkVariants(chunk, mined).map((l): OreLossRow => {
    const m = got.get(l.typeId) ?? 0;
    const lost = Math.max(0, l.quantity - m);
    return { typeId: l.typeId, chunk: l.quantity, mined: m, lost, pct: pctOf(lost, l.quantity) };
  });
  const total = rows.reduce((s, r) => s + r.chunk, 0);
  const lost = rows.reduce((s, r) => s + r.lost, 0);
  return { kind: fullyMined ? 'residue' : 'combined', rows, totalPct: pctOf(lost, total) };
}
