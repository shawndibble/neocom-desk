/**
 * Moon ore variants. Each of the 20 moon ores comes in two richer variants (+15% and +100%
 * yield, e.g. Brimful and Glistening Bitumens), its own type. EVE's moon drill notifications
 * list only the base ores: which rocks come up as a variant is decided when the chunk fractures.
 * The ledger records each variant as its own type, so a notified make-up compared type by type
 * would match no Brimful ore mined at all. The table is the SDE's, pinned by its test against
 * `public/data/types.json`.
 */
import type { OreLine } from './types';

/** Base moon ore → its +15% and +100% variants. */
export const MOON_ORE_VARIANTS: ReadonlyMap<number, readonly [number, number]> = new Map([
  [45490, [46280, 46281]], // Zeolites
  [45491, [46282, 46283]], // Sylvite
  [45492, [46284, 46285]], // Bitumens
  [45493, [46286, 46287]], // Coesite
  [45494, [46288, 46289]], // Cobaltite
  [45495, [46290, 46291]], // Euxenite
  [45496, [46292, 46293]], // Titanite
  [45497, [46294, 46295]], // Scheelite
  [45498, [46296, 46297]], // Otavite
  [45499, [46298, 46299]], // Sperrylite
  [45500, [46300, 46301]], // Vanadinite
  [45501, [46302, 46303]], // Chromite
  [45502, [46304, 46305]], // Carnotite
  [45503, [46306, 46307]], // Zircon
  [45504, [46308, 46309]], // Pollucite
  [45506, [46310, 46311]], // Cinnabar
  [45510, [46312, 46313]], // Xenotime
  [45511, [46314, 46315]], // Monazite
  [45512, [46316, 46317]], // Loparite
  [45513, [46318, 46319]], // Ytterbite
]);

const BASE_OF: ReadonlyMap<number, number> = new Map(
  [...MOON_ORE_VARIANTS].flatMap(([base, variants]) => variants.map((v) => [v, base] as const))
);

/** A variant's base moon ore; any other type is its own. */
export const moonOreBaseOf = (typeId: number): number => BASE_OF.get(typeId) ?? typeId;

/** Each type's total quantity over `lines` (a type may come on several lines). */
export function sumByType(lines: readonly OreLine[]): Map<number, number> {
  const sums = new Map<number, number>();
  for (const l of lines) sums.set(l.typeId, (sums.get(l.typeId) ?? 0) + l.quantity);
  return sums;
}

/** Per type, the quantities of `lines` in base ore `base`'s family (the base and its variants). */
const familyOf = (base: number, lines: readonly OreLine[]): Map<number, number> =>
  sumByType(lines.filter((l) => l.quantity > 0 && moonOreBaseOf(l.typeId) === base));

/** `total` shared out by `weights`, kept exactly; the rounding goes to the largest share. */
function shareOut(total: number, weights: ReadonlyMap<number, number>): OreLine[] {
  const sum = [...weights.values()].reduce((s, w) => s + w, 0);
  const parts = [...weights]
    .sort(([a], [b]) => a - b)
    .map(([typeId, w]) => ({ typeId, quantity: Math.floor((total * w) / sum), w }));
  const largest = parts.reduce((best, p) => (p.w > best.w ? p : best));
  largest.quantity += total - parts.reduce((s, p) => s + p.quantity, 0);
  return parts.map(({ typeId, quantity }) => ({ typeId, quantity }));
}

/**
 * A chunk make-up with each base moon ore's family (the base and its variants) split by what was
 * mined of it. Mined always wins, also over a family the make-up already splits (a survey's, or
 * a survey hint applied before the ledger rows were read): a survey scanned part-way through
 * mining is skewed. Nothing of the family mined: a make-up that already names its variants keeps
 * them, else a linked survey's split stands in, else the line stays whole. Each family's total is
 * kept exactly. Any other ore is left as it is.
 */
export function splitChunkVariants(
  chunk: readonly OreLine[],
  mined: readonly OreLine[],
  survey: readonly OreLine[] = []
): OreLine[] {
  const out: OreLine[] = [];
  const done = new Set<number>();
  for (const line of chunk) {
    const base = moonOreBaseOf(line.typeId);
    if (!MOON_ORE_VARIANTS.has(base)) {
      out.push(line);
      continue;
    }
    if (done.has(base)) continue;
    done.add(base);
    const family = chunk.filter((l) => moonOreBaseOf(l.typeId) === base);
    const alreadySplit = family.some((l) => l.typeId !== base);
    let weights = familyOf(base, mined);
    if (weights.size === 0 && !alreadySplit) weights = familyOf(base, survey);
    if (weights.size === 0) {
      out.push(...family);
      continue;
    }
    out.push(
      ...shareOut(
        family.reduce((s, l) => s + l.quantity, 0),
        weights
      )
    );
  }
  return out;
}

/**
 * The whole percent of a chunk the ledger shows mined, each ore capped at its own line, with a
 * base ore's variants counted against it (`splitChunkVariants`). Null for an empty make-up.
 */
export function chunkMinedPct(chunk: readonly OreLine[], mined: readonly OreLine[]): number | null {
  const got = sumByType(mined);
  const lines = splitChunkVariants(chunk, mined);
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  if (total <= 0) return null;
  const share = lines.reduce((s, l) => s + Math.min(l.quantity, got.get(l.typeId) ?? 0), 0);
  return Math.min(100, Math.round((share / total) * 100));
}
