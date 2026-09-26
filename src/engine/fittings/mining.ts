/**
 * Mining yield — this app's own arithmetic over the engine's final per-item
 * attributes (ADR 0016: what the engine doesn't compute is ours, and said so).
 * The engine applies skills, the hull, upgrades and a loaded crystal to each
 * miner's `miningAmount` and cycle; this turns those into m³ a second and an
 * hour, with the expected critical successes added and the expected residue
 * (ore destroyed on top of the yield, not taken out of it) beside it. Pure.
 *
 * Attribute ids are plain SDE, looked up by name in the pinned `sde.dat` on
 * 2026-09-25 (`miningAmount`, `duration`, `miningWasteProbability` — percent —
 * `miningWastedVolumeMultiplier`, `miningCritChance` — a share — and
 * `miningCritBonusYield`), and read back off a live run: a Modulated Strip
 * Miner II with a Simple Asteroid Mining Crystal Type A II on a Hulk reads a
 * bigger amount and a higher residue chance than the same miner bare.
 */

export const MINING_ATTRIBUTE = {
  miningAmount: 77,
  duration: 73,
  wasteProbability: 3154,
  wasteMultiplier: 3153,
  critChance: 5967,
  critBonus: 5969,
} as const;

/** One kind of miner in the fit — every copy of a module (and crystal), or one drone stack. */
export interface MinerInput {
  typeId: number;
  chargeTypeId?: number;
  isDrone: boolean;
  /** Modules of this type, or drones in the stack. */
  quantity: number;
  /** m³ one of them mines a cycle. */
  amount: number;
  cycleSeconds: number;
  /** Chance (0–1) a cycle leaves residue. */
  wasteChance: number;
  /** Residue, as a multiple of the cycle's amount. */
  wasteMultiplier: number;
  /** Chance (0–1) a cycle is a critical success. */
  critChance: number;
  /** A critical success's extra yield, as a multiple of the cycle's amount. */
  critBonus: number;
}

export interface MiningRow {
  typeId: number;
  chargeTypeId?: number;
  isDrone: boolean;
  count: number;
  /** m³ all of them mine a cycle, crits expected in. */
  perCycle: number;
  cycleSeconds: number;
  perSecond: number;
  /** m³ of residue a second, expected. */
  wastePerSecond: number;
}

export interface MiningStats {
  rows: MiningRow[];
  /** m³ a second, every miner and mining drone together. */
  perSecond: number;
  perHour: number;
  wastePerSecond: number;
  /** Residue as a share of the yield, percent. */
  wastePct: number;
}

export function miningYield(miners: readonly MinerInput[]): MiningStats {
  const rows = miners.map((miner): MiningRow => {
    const base = miner.amount * miner.quantity;
    const perCycle = base * (1 + miner.critChance * miner.critBonus);
    const cycle = miner.cycleSeconds > 0 ? miner.cycleSeconds : Infinity;
    return {
      typeId: miner.typeId,
      ...(miner.chargeTypeId === undefined ? {} : { chargeTypeId: miner.chargeTypeId }),
      isDrone: miner.isDrone,
      count: miner.quantity,
      perCycle,
      cycleSeconds: miner.cycleSeconds,
      perSecond: perCycle / cycle,
      wastePerSecond: (base * miner.wasteChance * miner.wasteMultiplier) / cycle,
    };
  });
  const perSecond = rows.reduce((sum, row) => sum + row.perSecond, 0);
  const wastePerSecond = rows.reduce((sum, row) => sum + row.wastePerSecond, 0);
  return {
    rows,
    perSecond,
    perHour: perSecond * 3600,
    wastePerSecond,
    wastePct: perSecond > 0 ? (wastePerSecond / perSecond) * 100 : 0,
  };
}

/** Seconds to fill a hold of `capacity` m³ at `perSecond`; null with no hold or no yield. */
export function holdFillSeconds(capacity: number, perSecond: number): number | null {
  return capacity > 0 && perSecond > 0 ? capacity / perSecond : null;
}

interface AttributeMap {
  get(attributeId: number): { value: number } | undefined;
}

interface ItemLike {
  type_id: number;
  slot: { type: string };
  state: string;
  quantity?: number;
  charge?: { type_id: number };
}

interface ResultLike {
  attributes: AttributeMap;
  state: string;
}

const MODULE_SLOTS: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'rig', 'subsystem']);

/**
 * The fit's miners off a calculation: running modules with a mining amount,
 * grouped by type and crystal, and launched mining drone stacks (the Fitting
 * says launched — `item.state` — as the engine reports bay drones active too).
 * `items`/`results` are the index-parallel `dogmaFit.items` and `calculation.items`.
 */
export function extractMining(
  items: readonly ItemLike[],
  results: readonly ResultLike[]
): MinerInput[] {
  const miners = new Map<string, MinerInput>();
  items.forEach((item, index) => {
    const result = results[index];
    if (!result) return;
    const isDrone = item.slot.type === 'drone_bay';
    if (isDrone ? item.state !== 'active' : !MODULE_SLOTS.has(item.slot.type)) return;
    if (!isDrone && result.state !== 'active' && result.state !== 'overload') return;
    const read = (id: number) => result.attributes.get(id)?.value ?? 0;
    const amount = read(MINING_ATTRIBUTE.miningAmount);
    if (amount <= 0) return;
    const quantity = isDrone ? (item.quantity ?? 1) : 1;
    const chargeTypeId = isDrone ? undefined : item.charge?.type_id;
    const key = `${isDrone ? 'drone' : 'module'}:${item.type_id}:${chargeTypeId ?? ''}`;
    const known = miners.get(key);
    if (known) {
      known.quantity += quantity;
      return;
    }
    miners.set(key, {
      typeId: item.type_id,
      ...(chargeTypeId === undefined ? {} : { chargeTypeId }),
      isDrone,
      quantity,
      amount,
      cycleSeconds: read(MINING_ATTRIBUTE.duration) / 1000,
      wasteChance: read(MINING_ATTRIBUTE.wasteProbability) / 100,
      wasteMultiplier: result.attributes.get(MINING_ATTRIBUTE.wasteMultiplier)?.value ?? 1,
      critChance: read(MINING_ATTRIBUTE.critChance),
      critBonus: read(MINING_ATTRIBUTE.critBonus),
    });
  });
  return [...miners.values()];
}
