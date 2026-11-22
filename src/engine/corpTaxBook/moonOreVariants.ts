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

const BASE_OF = new Map(
  [...MOON_ORE_VARIANTS].flatMap(([base, variants]) => variants.map((v) => [v, base] as const))
);

/** A variant's base moon ore; any other type is its own. */
export const moonOreBaseOf = (typeId: number): number => BASE_OF.get(typeId) ?? typeId;

/** Per type, the quantities of `lines` of base ore `base`'s family. */
function familyWeights(base: number, lines: readonly OreLine[]): Map<number, number> {
  const family = new Map<number, number>();
  for (const l of lines) {
    if (l.quantity > 0 && moonOreBaseOf(l.typeId) === base)
      family.set(l.typeId, (family.get(l.typeId) ?? 0) + l.quantity);
  }
  return family;
}

/**
 * A chunk make-up with each base moon ore split into the variants that make it up. The split is
 * what was mined of that ore, else (nothing of it mined yet) a linked survey's: a survey scanned
 * part-way through mining is skewed, so it only stands in until the ledger shows that ore. With
 * neither, or a make-up that already names its variants (a survey's), the line stays whole. Each
 * ore's total is kept exactly; the rounding goes to its largest share.
 */
export function splitChunkVariants(
  chunk: readonly OreLine[],
  mined: readonly OreLine[],
  survey: readonly OreLine[] = []
): OreLine[] {
  const named = new Set(
    chunk.filter((l) => BASE_OF.has(l.typeId)).map((l) => moonOreBaseOf(l.typeId))
  );
  return chunk.flatMap((line): OreLine[] => {
    if (!MOON_ORE_VARIANTS.has(line.typeId) || named.has(line.typeId)) return [line];
    let weights = familyWeights(line.typeId, mined);
    if (weights.size === 0) weights = familyWeights(line.typeId, survey);
    if (weights.size === 0 || (weights.size === 1 && weights.has(line.typeId))) return [line];
    const total = [...weights.values()].reduce((s, w) => s + w, 0);
    const parts = [...weights]
      .sort(([a], [b]) => a - b)
      .map(([typeId, w]) => ({ typeId, quantity: Math.floor((line.quantity * w) / total), w }));
    const largest = parts.reduce((best, p) => (p.w > best.w ? p : best));
    largest.quantity += line.quantity - parts.reduce((s, p) => s + p.quantity, 0);
    return parts.map(({ typeId, quantity }) => ({ typeId, quantity }));
  });
}

/**
 * The whole percent of a chunk the ledger shows mined, each ore capped at its own line, with a
 * base ore's variants counted against it (`splitChunkVariants`). Null for an empty make-up.
 */
export function chunkMinedPct(chunk: readonly OreLine[], mined: readonly OreLine[]): number | null {
  const got = new Map<number, number>();
  for (const m of mined) got.set(m.typeId, (got.get(m.typeId) ?? 0) + m.quantity);
  const lines = splitChunkVariants(chunk, mined);
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  if (total <= 0) return null;
  const share = lines.reduce((s, l) => s + Math.min(l.quantity, got.get(l.typeId) ?? 0), 0);
  return Math.min(100, Math.round((share / total) * 100));
}
