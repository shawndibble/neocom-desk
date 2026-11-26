import type { OreLine } from './types';

export const MOON_ORE_VARIANTS: ReadonlyMap<number, readonly [number, number]> = new Map([
  [45490, [46280, 46281]],
  [45491, [46282, 46283]],
  [45492, [46284, 46285]],
  [45493, [46286, 46287]],
  [45494, [46288, 46289]],
  [45495, [46290, 46291]],
  [45496, [46292, 46293]],
  [45497, [46294, 46295]],
  [45498, [46296, 46297]],
  [45499, [46298, 46299]],
  [45500, [46300, 46301]],
  [45501, [46302, 46303]],
  [45502, [46304, 46305]],
  [45503, [46306, 46307]],
  [45504, [46308, 46309]],
  [45506, [46310, 46311]],
  [45510, [46312, 46313]],
  [45511, [46314, 46315]],
  [45512, [46316, 46317]],
  [45513, [46318, 46319]],
]);

const BASE_OF: ReadonlyMap<number, number> = new Map(
  [...MOON_ORE_VARIANTS].flatMap(([base, variants]) => variants.map((v) => [v, base] as const))
);

export const moonOreBaseOf = (typeId: number): number => BASE_OF.get(typeId) ?? typeId;

export function sumByType(lines: readonly OreLine[]): Map<number, number> {
  const sums = new Map<number, number>();
  for (const l of lines) sums.set(l.typeId, (sums.get(l.typeId) ?? 0) + l.quantity);
  return sums;
}

const familyOf = (base: number, lines: readonly OreLine[]): Map<number, number> =>
  sumByType(lines.filter((l) => l.quantity > 0 && moonOreBaseOf(l.typeId) === base));

function shareOut(total: number, weights: ReadonlyMap<number, number>): OreLine[] {
  const sum = [...weights.values()].reduce((s, w) => s + w, 0);
  const parts = [...weights]
    .sort(([a], [b]) => a - b)
    .map(([typeId, w]) => ({ typeId, quantity: Math.floor((total * w) / sum), w }));
  const largest = parts.reduce((best, p) => (p.w > best.w ? p : best));
  largest.quantity += total - parts.reduce((s, p) => s + p.quantity, 0);
  return parts.map(({ typeId, quantity }) => ({ typeId, quantity }));
}

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

export function chunkMinedPct(chunk: readonly OreLine[], mined: readonly OreLine[]): number | null {
  const got = sumByType(mined);
  const lines = splitChunkVariants(chunk, mined);
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  if (total <= 0) return null;
  const share = lines.reduce((s, l) => s + Math.min(l.quantity, got.get(l.typeId) ?? 0), 0);
  return Math.min(100, Math.round((share / total) * 100));
}
