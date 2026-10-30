/**
 * Explore better (Improve Goal): what a fit's hacking and scanning modules
 * put out, read off the engine's final per-item attributes (ADR 0016: what
 * the engine does not compute is ours). Hacking is the best Data or Relic
 * Analyzer; scanning is the sum of the Scan Rangefinding, Pinpointing and
 * Acquisition Array bonuses. A Scan Probe Launcher and a Survey Scanner have
 * no figure of their own but count as explorer modules. Pure.
 *
 * Attribute ids are plain SDE, read back off a live run of the pinned engine
 * on a Buzzard (2026-10-29): Data/Relic Analyzer II read 1909 = 60 and
 * 1910 = 40; the Pinpointing, Acquisition and Rangefinding Array II read
 * 1905 = -20, 1906 = -20 and 1907 = 10 (the first two cut, a negative
 * percent); a Core Probe Launcher II takes scan probes (charge group 479).
 */

const EXPLORE_ATTRIBUTE = {
  duration: 73,
  chargeGroup1: 604,
  virusStrength: 1909,
  virusCoherence: 1910,
  scanDeviationBonus: 1905,
  scanDurationBonus: 1906,
  scanStrengthBonus: 1907,
  surveyScannerRange: 6050,
} as const;

/** The charge group a Scan Probe Launcher loads. */
const SCAN_PROBE_CHARGE_GROUP = 479;

/** One fitted, online analyzer's figures. */
export interface AnalyzerStats {
  strength: number;
  coherence: number;
  cycleSeconds: number;
}

export interface ExploreStats {
  /** Hacking, scanning, probe and survey modules fitted. */
  modules: number;
  /** The best analyzer's figures; 0 with none. */
  hacking: AnalyzerStats;
  /** Every fitted, online analyzer, in module order (a Data and a Relic Analyzer both count). */
  analyzers: AnalyzerStats[];
  /** Array bonuses added up, percent; a duration or deviation cut is positive. */
  scanning: { strength: number; duration: number; deviation: number };
}

export const NO_EXPLORE: ExploreStats = {
  modules: 0,
  hacking: { strength: 0, coherence: 0, cycleSeconds: 0 },
  analyzers: [],
  scanning: { strength: 0, duration: 0, deviation: 0 },
};

interface ItemLike {
  type_id: number;
  slot: { type: string };
}

interface ResultLike {
  attributes: { get(attributeId: number): { value: number } | undefined };
  state: string;
}

const MODULE_SLOTS: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'rig', 'subsystem']);

/** The fit's explorer figures off a calculation: `items`/`results` are the index-parallel `dogmaFit.items` and `calculation.items`. */
export function extractExplore(
  items: readonly ItemLike[],
  results: readonly ResultLike[]
): ExploreStats {
  const explore: ExploreStats = {
    modules: 0,
    hacking: { ...NO_EXPLORE.hacking },
    analyzers: [],
    scanning: { ...NO_EXPLORE.scanning },
  };
  items.forEach((item, index) => {
    const result = results[index];
    if (!result || !MODULE_SLOTS.has(item.slot.type) || result.state === 'offline') return;
    const read = (id: number) => result.attributes.get(id)?.value ?? 0;
    const strength = read(EXPLORE_ATTRIBUTE.virusStrength);
    const scan = {
      strength: read(EXPLORE_ATTRIBUTE.scanStrengthBonus),
      duration: -read(EXPLORE_ATTRIBUTE.scanDurationBonus),
      deviation: -read(EXPLORE_ATTRIBUTE.scanDeviationBonus),
    };
    const launcher = read(EXPLORE_ATTRIBUTE.chargeGroup1) === SCAN_PROBE_CHARGE_GROUP;
    const survey = read(EXPLORE_ATTRIBUTE.surveyScannerRange) > 0;
    const isScan = scan.strength !== 0 || scan.duration !== 0 || scan.deviation !== 0;
    if (strength <= 0 && !isScan && !launcher && !survey) return;
    explore.modules++;
    if (strength > 0) {
      const cycle = read(EXPLORE_ATTRIBUTE.duration) / 1000;
      const { hacking } = explore;
      explore.analyzers.push({
        strength,
        coherence: read(EXPLORE_ATTRIBUTE.virusCoherence),
        cycleSeconds: cycle,
      });
      hacking.strength = Math.max(hacking.strength, strength);
      hacking.coherence = Math.max(hacking.coherence, read(EXPLORE_ATTRIBUTE.virusCoherence));
      if (cycle > 0)
        hacking.cycleSeconds =
          hacking.cycleSeconds > 0 ? Math.min(hacking.cycleSeconds, cycle) : cycle;
    }
    explore.scanning.strength += scan.strength;
    explore.scanning.duration += scan.duration;
    explore.scanning.deviation += scan.deviation;
  });
  return explore;
}
