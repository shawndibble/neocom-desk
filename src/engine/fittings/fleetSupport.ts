/**
 * Fleet boosts — what a command ship's running modules give its fleet: command
 * and mining foreman bursts (strength, range, length, reload) and the
 * compression service of an industrial core (compressor range, fuel per
 * activation). Read per module off the engine's calculation; every figure is
 * the module's own final attribute, skills and hull bonuses included. Pure.
 *
 * Attribute ids are plain SDE (`warfareBuff1ID`…`warfareBuff4Value`,
 * `buffDuration`, `maxRange`, `reloadTime`, `duration`, `consumptionType`,
 * `consumptionQuantity`, `requiredSkill1`; names present in the pinned
 * `sde.dat`), and each was confirmed on 2026-09-30 by a live run of the pinned
 * engine that raised one skill at a time on an Orca and a Vulture: Mining
 * Director / Shield Command Specialist move the buff values, Mining Foreman /
 * Shield Command the duration, Command Burst Specialist the reload, Leadership,
 * Wing Command and Fleet Command the burst range, Fleet Compression Logistics
 * the compressor range, Industrial Reconfiguration the fuel. The buff values
 * equal `calculation.outgoing.buffs`.
 *
 * A module is told by what it needs, not by a type list: a burst has a buff
 * duration; a compressor and an industrial core need Shipboard Compression
 * Technology and Industrial Reconfiguration. Siege and triage modules burn
 * fuel too, so the fuel attributes alone never make a core.
 */

export const FLEET_ATTRIBUTE = {
  optimal: 54,
  /** ms */
  cycle: 73,
  requiredSkill: 182,
  fuelType: 713,
  fuelQuantity: 714,
  /** ms */
  reload: 1795,
  /** ms */
  buffDuration: 2535,
  buffIds: [2468, 2470, 2472, 2536],
  buffValues: [2469, 2471, 2473, 2537],
} as const;

/** Shipboard Compression Technology, and its capital version. */
const COMPRESSOR_SKILLS: ReadonlySet<number> = new Set([62450, 62451]);
/** Industrial Reconfiguration, and its capital version. */
const CORE_SKILLS: ReadonlySet<number> = new Set([58956, 28585]);

export interface BurstRow {
  typeId: number;
  /** The loaded burst charge; absent: the burst hands nothing out. */
  chargeTypeId?: number;
  /** Modules of this type and charge running. */
  count: number;
  /**
   * The size of each buff it hands out, in the engine's own order, zero ones
   * left out. A shield or armor burst's buffs are negative (shorter cycles);
   * this is their size.
   */
  strengths: number[];
  rangeMeters: number;
  durationSeconds: number;
  reloadSeconds: number;
}

export interface CompressionRow {
  typeId: number;
  count: number;
  rangeMeters: number;
  cycleSeconds: number;
}

export interface CoreRow {
  typeId: number;
  /** The isotope or heavy water the core burns. */
  fuelTypeId: number;
  fuelPerCycle: number;
  cycleSeconds: number;
}

export interface FleetSupportStats {
  bursts: BurstRow[];
  compressors: CompressionRow[];
  core: CoreRow | null;
}

export const NO_FLEET_SUPPORT: FleetSupportStats = { bursts: [], compressors: [], core: null };

/** Whether the fit gives its fleet anything at all — the section has nothing to show otherwise. */
export function hasFleetSupport(stats: FleetSupportStats): boolean {
  return stats.bursts.length > 0 || stats.compressors.length > 0 || stats.core !== null;
}

interface ItemLike {
  type_id: number;
  slot: { type: string };
  charge?: { type_id: number };
}

interface ResultLike {
  attributes: { get(attributeId: number): { value: number } | undefined };
  state: string;
}

const MODULE_SLOTS: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'rig', 'subsystem']);

/** `items`/`results` are the index-parallel `dogmaFit.items` and `calculation.items`. */
export function extractFleetSupport(
  items: readonly ItemLike[],
  results: readonly ResultLike[]
): FleetSupportStats {
  const bursts = new Map<string, BurstRow>();
  const compressors = new Map<number, CompressionRow>();
  let core: CoreRow | null = null;
  items.forEach((item, index) => {
    const result = results[index];
    if (!result || !MODULE_SLOTS.has(item.slot.type)) return;
    if (result.state !== 'active' && result.state !== 'overload') return;
    const read = (id: number) => result.attributes.get(id)?.value ?? 0;

    if (read(FLEET_ATTRIBUTE.buffDuration) > 0) {
      const chargeTypeId = item.charge?.type_id;
      const key = `${item.type_id}:${chargeTypeId ?? ''}`;
      const known = bursts.get(key);
      if (known) {
        known.count += 1;
        return;
      }
      // A buff counts once it has an id: a burst with no charge has values but nothing to hand out.
      const strengths = FLEET_ATTRIBUTE.buffIds.flatMap((idAttribute, slot) => {
        const value = Math.abs(read(FLEET_ATTRIBUTE.buffValues[slot] ?? 0));
        return read(idAttribute) > 0 && value > 0 ? [value] : [];
      });
      bursts.set(key, {
        typeId: item.type_id,
        ...(chargeTypeId === undefined ? {} : { chargeTypeId }),
        count: 1,
        strengths,
        rangeMeters: read(FLEET_ATTRIBUTE.optimal),
        durationSeconds: read(FLEET_ATTRIBUTE.buffDuration) / 1000,
        reloadSeconds: read(FLEET_ATTRIBUTE.reload) / 1000,
      });
      return;
    }

    const skill = read(FLEET_ATTRIBUTE.requiredSkill);
    if (COMPRESSOR_SKILLS.has(skill)) {
      const known = compressors.get(item.type_id);
      if (known) known.count += 1;
      else
        compressors.set(item.type_id, {
          typeId: item.type_id,
          count: 1,
          rangeMeters: read(FLEET_ATTRIBUTE.optimal),
          cycleSeconds: read(FLEET_ATTRIBUTE.cycle) / 1000,
        });
    } else if (CORE_SKILLS.has(skill) && core === null) {
      core = {
        typeId: item.type_id,
        fuelTypeId: read(FLEET_ATTRIBUTE.fuelType),
        fuelPerCycle: read(FLEET_ATTRIBUTE.fuelQuantity),
        cycleSeconds: read(FLEET_ATTRIBUTE.cycle) / 1000,
      };
    }
  });
  return { bursts: [...bursts.values()], compressors: [...compressors.values()], core };
}
