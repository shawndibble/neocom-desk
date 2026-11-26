import type { LocalRepair } from './types';

export const SUPPORT_ATTRIBUTE = {
  armorRepairRate: -45,
  hullRepairRate: -46,
  shieldBoostRate: -47,
  capacitorTransferRate: -66,
  capacitorPeakLoad: -4,
  energyNeutralizerAmount: 97,
  optimal: 54,
  warpScrambleRange: 103,
  ecmBurstRange: 142,
  falloff: 2044,
  speedFactor: 20,
  warpScrambleStrength: 105,
  ecmGravimetric: 238,
  ecmLadar: 239,
  ecmMagnetometric: 240,
  ecmRadar: 241,
  signatureRadiusBonus: 554,
  maxRangeBonus: 351,
  falloffBonus: 349,
  trackingSpeedBonus: 767,
  maxTargetRangeBonus: 309,
  scanResolutionBonus: 566,
  missileVelocityBonus: 547,
  explosionDelayBonus: 596,
  aoeVelocityBonus: 847,
  aoeCloudSizeBonus: 848,
} as const;

export type SupportKind =
  | 'remoteShield'
  | 'remoteArmor'
  | 'remoteHull'
  | 'neutralizer'
  | 'nosferatu'
  | 'capTransfer'
  | 'web'
  | 'warpDisruption'
  | 'ecm'
  | 'targetPainter'
  | 'trackingDisruptor'
  | 'sensorDampener'
  | 'guidanceDisruptor';

const SUMMED: ReadonlySet<SupportKind> = new Set([
  'remoteShield',
  'remoteArmor',
  'remoteHull',
  'neutralizer',
  'nosferatu',
  'capTransfer',
  'warpDisruption',
]);

export type SupportEffectKind =
  | 'optimalRange'
  | 'falloff'
  | 'trackingSpeed'
  | 'lockRange'
  | 'scanResolution'
  | 'missileVelocity'
  | 'missileFlightTime'
  | 'explosionVelocity'
  | 'explosionRadius'
  | 'jamGravimetric'
  | 'jamLadar'
  | 'jamMagnetometric'
  | 'jamRadar';

export interface SupportEffect {
  effect: SupportEffectKind;
  amount: number;
}

export interface SupportRow {
  kind: SupportKind;
  typeId: number;
  count: number;
  amount: number;
  optimal: number;
  falloff: number;
  effects: SupportEffect[];
}

export interface SupportStats {
  rows: SupportRow[];
  remoteRepair: LocalRepair;
  capTransfer: number;
  neutralizer: number;
  nosferatu: number;
}

interface AttributeMap {
  get(attributeId: number): { value: number } | undefined;
}

interface ItemLike {
  type_id: number;
  slot: { type: string };
}

interface ResultLike {
  attributes: AttributeMap;
  state: string;
}

const MODULE_SLOTS: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'rig', 'subsystem']);

const EPSILON = 1e-9;

type Reading = { kind: SupportKind; amount: number; effects: SupportEffect[] };

function effectsOf(
  read: (id: number) => number,
  pairs: readonly (readonly [SupportEffectKind, number])[]
): SupportEffect[] {
  return pairs
    .map(([effect, id]) => ({ effect, amount: read(id) }))
    .filter((e) => Math.abs(e.amount) > EPSILON);
}

function ewar(kind: SupportKind, effects: SupportEffect[]): Reading {
  return { kind, amount: Math.max(...effects.map((e) => Math.abs(e.amount))), effects };
}

export function classifySupport(read: (id: number) => number): Reading | null {
  const A = SUPPORT_ATTRIBUTE;
  const plain = (kind: SupportKind, amount: number): Reading => ({ kind, amount, effects: [] });
  if (read(A.shieldBoostRate) > 0) return plain('remoteShield', read(A.shieldBoostRate));
  if (read(A.armorRepairRate) > 0) return plain('remoteArmor', read(A.armorRepairRate));
  if (read(A.hullRepairRate) > 0) return plain('remoteHull', read(A.hullRepairRate));
  const transfer = read(A.capacitorTransferRate);
  if (transfer > 0) {
    if (read(A.energyNeutralizerAmount) > 0) return plain('neutralizer', transfer);
    if (read(A.capacitorPeakLoad) < 0) return plain('nosferatu', transfer);
    return plain('capTransfer', transfer);
  }
  if (read(A.speedFactor) < 0) return plain('web', -read(A.speedFactor));
  if (read(A.warpScrambleStrength) > 0)
    return plain('warpDisruption', read(A.warpScrambleStrength));
  const jams = effectsOf(read, [
    ['jamGravimetric', A.ecmGravimetric],
    ['jamLadar', A.ecmLadar],
    ['jamMagnetometric', A.ecmMagnetometric],
    ['jamRadar', A.ecmRadar],
  ]).filter((e) => e.amount > 0);
  if (jams.length > 0) return ewar('ecm', jams);
  if (read(A.signatureRadiusBonus) > 0) return plain('targetPainter', read(A.signatureRadiusBonus));

  const hostile = (effects: SupportEffect[], worse: (e: SupportEffect) => boolean) =>
    effects.length > 0 && effects.some(worse);
  const tracking = effectsOf(read, [
    ['optimalRange', A.maxRangeBonus],
    ['falloff', A.falloffBonus],
    ['trackingSpeed', A.trackingSpeedBonus],
  ]);
  if (hostile(tracking, (e) => e.amount < 0)) return ewar('trackingDisruptor', tracking);
  const sensors = effectsOf(read, [
    ['lockRange', A.maxTargetRangeBonus],
    ['scanResolution', A.scanResolutionBonus],
  ]);
  if (hostile(sensors, (e) => e.amount < 0)) return ewar('sensorDampener', sensors);
  const guidance = effectsOf(read, [
    ['missileVelocity', A.missileVelocityBonus],
    ['missileFlightTime', A.explosionDelayBonus],
    ['explosionVelocity', A.aoeVelocityBonus],
    ['explosionRadius', A.aoeCloudSizeBonus],
  ]);
  if (hostile(guidance, (e) => (e.effect === 'explosionRadius' ? e.amount > 0 : e.amount < 0)))
    return ewar('guidanceDisruptor', guidance);
  return null;
}

export function extractSupport(
  items: readonly ItemLike[],
  results: readonly ResultLike[]
): SupportStats {
  const rows = new Map<string, SupportRow>();
  items.forEach((item, index) => {
    const result = results[index];
    if (!result || !MODULE_SLOTS.has(item.slot.type)) return;
    if (result.state !== 'active' && result.state !== 'overload') return;
    const read = (id: number) => result.attributes.get(id)?.value ?? 0;
    const optimal =
      read(SUPPORT_ATTRIBUTE.optimal) ||
      read(SUPPORT_ATTRIBUTE.warpScrambleRange) ||
      read(SUPPORT_ATTRIBUTE.ecmBurstRange);
    if (optimal <= 0) return;
    const what = classifySupport(read);
    if (!what) return;
    const signature = what.effects.map((e) => `${e.effect}=${e.amount.toFixed(4)}`).join(',');
    const key = `${what.kind}:${item.type_id}:${signature}`;
    const row = rows.get(key);
    if (row) {
      row.count += 1;
      if (SUMMED.has(what.kind)) row.amount += what.amount;
      else row.amount = Math.max(row.amount, what.amount);
    } else {
      rows.set(key, {
        kind: what.kind,
        typeId: item.type_id,
        count: 1,
        amount: what.amount,
        optimal,
        falloff: read(SUPPORT_ATTRIBUTE.falloff),
        effects: what.effects,
      });
    }
  });

  const all = [...rows.values()];
  const total = (kind: SupportKind) =>
    all.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.amount, 0);
  return {
    rows: all,
    remoteRepair: {
      shield: total('remoteShield'),
      armor: total('remoteArmor'),
      hull: total('remoteHull'),
    },
    capTransfer: total('capTransfer'),
    neutralizer: total('neutralizer'),
    nosferatu: total('nosferatu'),
  };
}
