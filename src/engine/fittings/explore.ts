/**
 * Hacking and scanning figures for the Explore better Improve Goal, read off
 * the engine's final per-item attributes (ADR 0016). Ids are plain SDE:
 * `virusCoherence`, `virusStrength`, `accessDifficultyBonus`, and a loaded
 * probe's `baseSensorStrength`. Scan time is not scored: the engine moves no
 * launcher duration for a Signal Focusing Kit. Pure.
 */

export const EXPLORE_ATTRIBUTE = {
  virusCoherence: 1909,
  virusStrength: 1910,
  accessDifficultyBonus: 902,
  baseSensorStrength: 1371,
} as const;

/** What a fit's running analyzers and loaded probes add up to. */
export interface ExploreStats {
  /** Every running analyzer's virus figures added up. */
  hacking: { coherence: number; strength: number; access: number };
  /** The strongest loaded probe's sensor strength; 0 with none loaded. */
  probeStrength: number;
}

export const EMPTY_EXPLORE: ExploreStats = {
  hacking: { coherence: 0, strength: 0, access: 0 },
  probeStrength: 0,
};

interface AttributeMap {
  get(attributeId: number): { value: number } | undefined;
}

interface ItemLike {
  type_id: number;
  slot: { type: string };
  state: string;
}

interface ResultLike {
  attributes: AttributeMap;
  state: string;
  charge?: { attributes: AttributeMap };
}

const MODULE_SLOTS: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

/**
 * The running analyzers (a module with a virus coherence) and the loaded
 * probes of a calculation. `items`/`results` are the index-parallel
 * `dogmaFit.items` and `calculation.items`. A rig carries these attributes as
 * a bonus and is read through the module it changes.
 */
export function extractExplore(
  items: readonly ItemLike[],
  results: readonly ResultLike[]
): ExploreStats {
  const hacking = { coherence: 0, strength: 0, access: 0 };
  let probeStrength = 0;
  items.forEach((item, index) => {
    const result = results[index];
    if (!result || !MODULE_SLOTS.has(item.slot.type)) return;
    if (result.state !== 'active' && result.state !== 'overload') return;
    const read = (id: number) => result.attributes.get(id)?.value ?? 0;
    if (read(EXPLORE_ATTRIBUTE.virusCoherence) > 0) {
      hacking.coherence += read(EXPLORE_ATTRIBUTE.virusCoherence);
      hacking.strength += read(EXPLORE_ATTRIBUTE.virusStrength);
      hacking.access += read(EXPLORE_ATTRIBUTE.accessDifficultyBonus);
    }
    const charged = result.charge?.attributes.get(EXPLORE_ATTRIBUTE.baseSensorStrength)?.value ?? 0;
    probeStrength = Math.max(probeStrength, charged);
  });
  return { hacking, probeStrength };
}

/** The before/after pairs of the figures the fit already has, for a mean relative gain. */
export function exploreFigures(
  before: ExploreStats,
  after: ExploreStats
): (readonly [number, number])[] {
  const pairs: (readonly [number, number])[] = [
    [before.hacking.coherence, after.hacking.coherence],
    [before.hacking.strength, after.hacking.strength],
    [before.hacking.access, after.hacking.access],
    [before.probeStrength, after.probeStrength],
  ];
  return pairs.filter(([was]) => was > 0);
}

/** Whether the fit has a running analyzer or a loaded probe to score. */
export const hasExplore = (stats: ExploreStats): boolean =>
  stats.hacking.coherence > 0 || stats.probeStrength > 0;
