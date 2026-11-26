export const MINING_ATTRIBUTE = {
  miningAmount: 77,
  duration: 73,
  wasteProbability: 3154,
  wasteMultiplier: 3153,
  critChance: 5967,
  critBonus: 5969,
} as const;

export interface MinerInput {
  typeId: number;
  chargeTypeId?: number;
  isDrone: boolean;
  quantity: number;
  amount: number;
  cycleSeconds: number;
  wasteChance: number;
  wasteMultiplier: number;
  critChance: number;
  critBonus: number;
}

export interface MiningRow {
  typeId: number;
  chargeTypeId?: number;
  isDrone: boolean;
  count: number;
  perCycle: number;
  cycleSeconds: number;
  perSecond: number;
  wastePerSecond: number;
}

export interface MiningStats {
  rows: MiningRow[];
  perSecond: number;
  perHour: number;
  wastePerSecond: number;
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

export interface CrystalFigures {
  m3PerSecond: number;
  cycleSeconds: number;
  residueChance: number;
  residueMultiplier: number;
  residueM3s: number;
  removedM3s: number;
}

export function extractCrystalFigures(
  items: readonly ItemLike[],
  results: readonly ResultLike[],
  indices: readonly number[]
): CrystalFigures | null {
  const picked = indices.flatMap((index) => {
    const item = items[index];
    const result = results[index];
    return item && result ? [{ item, result }] : [];
  });
  const miners = extractMining(
    picked.map((p) => p.item),
    picked.map((p) => p.result)
  ).filter((miner) => !miner.isDrone);
  const miner = miners[0];
  if (!miner) return null;
  const totals = miningYield(miners);
  return {
    m3PerSecond: totals.perSecond,
    cycleSeconds: miner.cycleSeconds,
    residueChance: miner.wasteChance,
    residueMultiplier: miner.wasteMultiplier,
    residueM3s: totals.wastePerSecond,
    removedM3s: totals.perSecond + totals.wastePerSecond,
  };
}
