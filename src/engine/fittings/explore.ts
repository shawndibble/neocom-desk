/**
 * Explore better (Improve Goal): what a fit's hacking and scanning modules
 * put out, read off the engine's final per-item attributes (ADR 0016: what
 * the engine does not compute is ours). Hacking is the best Data or Relic
 * Analyzer; scanning is the sum of the Scan Rangefinding, Pinpointing and
 * Acquisition Array bonuses; probing is the loaded probe's strength (the
 * engine folds the launcher, rigs, skills and hull into it) and the
 * launcher's own bonus, which an empty launcher still has. A cloak's relock
 * delay rides along but does not make a fit an explorer's, and so does whether
 * it can warp cloaked: a type effect (980), which the engine's results do not
 * carry, so the caller passes the covert cloak type ids (`typeEffects.json`). Pure.
 *
 * Attribute ids are plain SDE, named by `market/attributes.json`: 1910 is Virus
 * Strength and 1909 Virus Coherence (a Data Analyzer II carries 30 and 60; a
 * Buzzard's +10 strength lands on 1910, 40). The Pinpointing, Acquisition and
 * Rangefinding Array II read 1905 = -20, 1906 = -20 and 1907 = 10 (the first
 * two cut, a negative percent); a Core Probe Launcher II takes scan probes
 * (charge group 479). Survey Scan Range is 197 (6050 is a mining crit bonus).
 * A probe's Base Sensor Strength is 1371 (a Sisters launcher and probe read
 * 104 on an Astero), the launcher's Probe Scan Strength Bonus 846, its rate of
 * fire 51; a cloak's Sensor Recalibration Time is 560. An analyzer opens the
 * sites of the skills it requires (182/183): Hacking data, Archaeology relic.
 */

const EXPLORE_ATTRIBUTE = {
  duration: 73,
  chargeGroup1: 604,
  virusStrength: 1910,
  virusCoherence: 1909,
  scanDeviationBonus: 1905,
  scanDurationBonus: 1906,
  scanStrengthBonus: 1907,
  surveyScannerRange: 197,
  utilitySlots: 1911,
  probeStrength: 1371,
  probeBonus: 846,
  rateOfFire: 51,
  recalibration: 560,
  requiredSkill1: 182,
  requiredSkill2: 183,
} as const;

/** The skill an analyzer needs for each kind of site it opens. */
const SITE_SKILL: Readonly<Record<number, ExploreSite>> = { 21718: 'data', 13278: 'relic' };

export type ExploreSite = 'data' | 'relic';

/** The dogma effect (`cloakingWarpSafe`) of a cloak that lets the ship warp while cloaked. */
export const COVERT_CLOAK_EFFECT = 980;

/** The charge group a Scan Probe Launcher loads. */
const SCAN_PROBE_CHARGE_GROUP = 479;

/** One fitted, online analyzer's figures. */
export interface AnalyzerStats {
  strength: number;
  coherence: number;
  cycleSeconds: number;
}

/** A fitted analyzer, with the sites it opens. */
export interface FittedAnalyzer extends AnalyzerStats {
  sites: ExploreSite[];
}

export interface ExploreStats {
  /** Hacking, scanning, probe and survey modules fitted. */
  modules: number;
  /** The best analyzer's figures; 0 with none. */
  hacking: AnalyzerStats;
  /** Every fitted, online analyzer, in module order (a Data and a Relic Analyzer both count). */
  analyzers: FittedAnalyzer[];
  /** The best strength among the analyzers that open data sites, and relic sites; 0 with none. */
  dataStrength: number;
  relicStrength: number;
  /** The most utility element slots an analyzer brings. */
  utilitySlots: number;
  /** Array bonuses added up, percent; a duration or deviation cut is positive. */
  scanning: { strength: number; duration: number; deviation: number };
  /** The loaded scan probe's strength (0 unloaded), the launcher's own bonus %, and its seconds between launches. */
  probe: { strength: number; launcherBonus: number; cycleSeconds: number };
  /** The quickest cloak's relock delay, seconds; 0 with no cloak. */
  cloakRecalibrationSeconds: number;
  /** An online Covert Ops cloak is fitted, so the ship can warp while cloaked. */
  warpsCloaked: boolean;
}

export const NO_EXPLORE: ExploreStats = {
  modules: 0,
  hacking: { strength: 0, coherence: 0, cycleSeconds: 0 },
  analyzers: [],
  dataStrength: 0,
  relicStrength: 0,
  utilitySlots: 0,
  scanning: { strength: 0, duration: 0, deviation: 0 },
  probe: { strength: 0, launcherBonus: 0, cycleSeconds: 0 },
  cloakRecalibrationSeconds: 0,
  warpsCloaked: false,
};

/** The smaller of two positive figures, where 0 means none yet. */
const minPositive = (a: number, b: number) => (a > 0 && b > 0 ? Math.min(a, b) : a || b);

interface ItemLike {
  type_id: number;
  slot: { type: string };
}

interface AttributeReader {
  get(attributeId: number): { value: number } | undefined;
}

interface ResultLike {
  attributes: AttributeReader;
  charge?: { attributes: AttributeReader } | null;
  state: string;
}

const MODULE_SLOTS: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'rig', 'subsystem']);

/** The fit's explorer figures off a calculation: `items`/`results` are the index-parallel `dogmaFit.items` and `calculation.items`; `covertCloakTypeIds` are the types that warp cloaked. */
export function extractExplore(
  items: readonly ItemLike[],
  results: readonly ResultLike[],
  covertCloakTypeIds: ReadonlySet<number> = new Set()
): ExploreStats {
  const explore: ExploreStats = {
    ...NO_EXPLORE,
    hacking: { ...NO_EXPLORE.hacking },
    analyzers: [],
    scanning: { ...NO_EXPLORE.scanning },
    probe: { ...NO_EXPLORE.probe },
  };
  items.forEach((item, index) => {
    const result = results[index];
    if (!result || !MODULE_SLOTS.has(item.slot.type) || result.state === 'offline') return;
    const read = (id: number) => result.attributes.get(id)?.value ?? 0;
    if (covertCloakTypeIds.has(item.type_id)) explore.warpsCloaked = true;
    const recalibration = read(EXPLORE_ATTRIBUTE.recalibration) / 1000;
    explore.cloakRecalibrationSeconds = minPositive(
      explore.cloakRecalibrationSeconds,
      recalibration
    );
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
      const coherence = read(EXPLORE_ATTRIBUTE.virusCoherence);
      const sites = [EXPLORE_ATTRIBUTE.requiredSkill1, EXPLORE_ATTRIBUTE.requiredSkill2].flatMap(
        (id) => {
          const site = SITE_SKILL[read(id)];
          return site ? [site] : [];
        }
      );
      // Data before relic, whichever skill slot carries it (an Integrated Analyzer has both).
      sites.sort();
      explore.analyzers.push({ strength, coherence, cycleSeconds: cycle, sites });
      const { hacking } = explore;
      hacking.strength = Math.max(hacking.strength, strength);
      hacking.coherence = Math.max(hacking.coherence, coherence);
      hacking.cycleSeconds = minPositive(hacking.cycleSeconds, cycle);
      if (sites.includes('data')) explore.dataStrength = Math.max(explore.dataStrength, strength);
      if (sites.includes('relic'))
        explore.relicStrength = Math.max(explore.relicStrength, strength);
      explore.utilitySlots = Math.max(explore.utilitySlots, read(EXPLORE_ATTRIBUTE.utilitySlots));
    }
    if (launcher) {
      const { probe } = explore;
      const loaded = result.charge?.attributes.get(EXPLORE_ATTRIBUTE.probeStrength)?.value ?? 0;
      probe.strength = Math.max(probe.strength, loaded);
      probe.launcherBonus = Math.max(probe.launcherBonus, read(EXPLORE_ATTRIBUTE.probeBonus));
      probe.cycleSeconds = minPositive(
        probe.cycleSeconds,
        read(EXPLORE_ATTRIBUTE.rateOfFire) / 1000
      );
    }
    explore.scanning.strength += scan.strength;
    explore.scanning.duration += scan.duration;
    explore.scanning.deviation += scan.deviation;
  });
  return explore;
}
