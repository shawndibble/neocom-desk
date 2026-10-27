// A moon's ore loss (issue #5257): what the chunk held that the ledger never shows delivered.
// Flagged Fully Mined it is Residue; unflagged it is Residue plus ore never mined, and the
// caller labels it so. Pure: the caller passes the chunk make-up and the ledger's mined ore.

export interface OreQty {
  typeId: number;
  quantity: number;
}

export interface OreLossRow {
  typeId: number;
  chunk: number;
  mined: number;
  lost: number;
  /** Share of this ore's chunk, whole percent. */
  pct: number;
}

export interface MoonLoss {
  kind: 'residue' | 'combined';
  rows: OreLossRow[];
  /** Share of the whole chunk, whole percent. */
  totalPct: number;
}

const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Null without a chunk source: no make-up means no figure. */
export function moonLoss(
  chunk: readonly OreQty[],
  mined: readonly OreQty[],
  fullyMined: boolean
): MoonLoss | null {
  if (chunk.length === 0) return null;
  const got = new Map<number, number>();
  for (const l of mined) got.set(l.typeId, (got.get(l.typeId) ?? 0) + l.quantity);
  const rows = chunk.map((l): OreLossRow => {
    const m = got.get(l.typeId) ?? 0;
    const lost = Math.max(0, l.quantity - m);
    return { typeId: l.typeId, chunk: l.quantity, mined: m, lost, pct: pctOf(lost, l.quantity) };
  });
  const total = rows.reduce((s, r) => s + r.chunk, 0);
  const lost = rows.reduce((s, r) => s + r.lost, 0);
  return { kind: fullyMined ? 'residue' : 'combined', rows, totalPct: pctOf(lost, total) };
}
