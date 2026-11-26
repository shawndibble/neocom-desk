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

const SITE_SKILL: Readonly<Record<number, ExploreSite>> = { 21718: 'data', 13278: 'relic' };

export type ExploreSite = 'data' | 'relic';

export const COVERT_CLOAK_EFFECT = 980;

const SCAN_PROBE_CHARGE_GROUP = 479;

export interface AnalyzerStats {
  strength: number;
  coherence: number;
  cycleSeconds: number;
}

export interface FittedAnalyzer extends AnalyzerStats {
  sites: ExploreSite[];
}

export interface ExploreStats {
  modules: number;
  hacking: AnalyzerStats;
  analyzers: FittedAnalyzer[];
  dataStrength: number;
  relicStrength: number;
  utilitySlots: number;
  scanning: { strength: number; duration: number; deviation: number };
  probe: { strength: number; launcherBonus: number; cycleSeconds: number };
  cloakRecalibrationSeconds: number;
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
