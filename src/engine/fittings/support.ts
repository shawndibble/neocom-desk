/**
 * Support out: what a Fitting's running modules do to another ship — remote
 * repair, capacitor transfer, neutralizing and nosferatu, and electronic
 * warfare. Read per module off the engine's calculation (every figure below
 * is the module's own final attribute, skills and heat included), grouped
 * by module type. Pure.
 *
 * The engine gives a remote repairer the same per-module repair-rate
 * attribute a local one has (patched `armorRepairRate` & co., HP/s) and a
 * capacitor module a `capacitorTransferRate` (GJ/s); what tells the local
 * and the outgoing apart is the optimal range only a projected module has.
 * A nosferatu's own capacitor draw reads negative — it feeds its user — which
 * is how it is told from a remote capacitor transmitter carrying the same
 * rate. Verified 2026-09-25 by a live run of the pinned engine against a
 * Caracal fitted with one of each.
 */
import type { LocalRepair } from './types';

export const SUPPORT_ATTRIBUTE = {
  // Patched per-module rates (EVEShipFit/sde-patched ids, read out of the
  // pinned `sde.dat`).
  armorRepairRate: -45,
  hullRepairRate: -46,
  shieldBoostRate: -47,
  capacitorTransferRate: -66,
  capacitorPeakLoad: -4,
  // Plain SDE, looked up by name in the pinned `sde.dat` 2026-09-25.
  energyNeutralizerAmount: 97,
  optimal: 54,
  falloff: 2044,
  speedFactor: 20,
  warpScrambleStrength: 105,
  ecmGravimetric: 238,
  ecmLadar: 239,
  ecmMagnetometric: 240,
  ecmRadar: 241,
  signatureRadiusBonus: 554,
  // Every effect a weapon disruptor or sensor dampener carries, so a script
  // that zeroes one of them (Optimal Range Disruption Script: no tracking)
  // never drops the module. Looked up by name in the pinned `sde.dat`
  // 2026-09-25 on Tracking Disruptor II, Remote Sensor Dampener II and
  // Guidance Disruptor II.
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

/**
 * Rates (HP/s, GJ/s) and warp disruption points add up across modules; an
 * electronic-warfare strength is each module's own — two webs don't slow a
 * target by 120%.
 */
const SUMMED: ReadonlySet<SupportKind> = new Set([
  'remoteShield',
  'remoteArmor',
  'remoteHull',
  'neutralizer',
  'nosferatu',
  'capTransfer',
  'warpDisruption',
]);

/**
 * One thing an electronic-warfare module does to its target: a signed %
 * change to one of the target's attributes (−17 optimal range, +12
 * explosion radius), or, for an ECM, one sensor type's jam strength.
 */
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
  /** Modules of this type doing it. */
  count: number;
  /**
   * HP/s or GJ/s for the whole row; warp disruption points for the whole
   * row; otherwise one module's strength — % for a web, painter, disruptor
   * or dampener, jam strength for an ECM.
   */
  amount: number;
  /** Metres. */
  optimal: number;
  falloff: number;
  /**
   * Every non-zero effect of a disruptor, dampener or jammer, in a fixed
   * order; empty for everything else, whose `amount` says it all.
   */
  effects: SupportEffect[];
}

export interface SupportStats {
  rows: SupportRow[];
  /** HP/s handed out, per layer. */
  remoteRepair: LocalRepair;
  /** GJ/s. */
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

/** Below this a value is the float noise of a scripted-out attribute, not an effect. */
const EPSILON = 1e-9;

type Reading = { kind: SupportKind; amount: number; effects: SupportEffect[] };

/** The non-zero ones of `pairs`, in order. */
function effectsOf(
  read: (id: number) => number,
  pairs: readonly (readonly [SupportEffectKind, number])[]
): SupportEffect[] {
  return pairs
    .map(([effect, id]) => ({ effect, amount: read(id) }))
    .filter((e) => Math.abs(e.amount) > EPSILON);
}

/** An electronic-warfare reading, headlined by its largest effect. */
function ewar(kind: SupportKind, effects: SupportEffect[]): Reading {
  return { kind, amount: Math.max(...effects.map((e) => Math.abs(e.amount))), effects };
}

/**
 * What one running, projected module does, as a kind, an amount and — for
 * electronic warfare — every effect it has. A disruptor or dampener is told
 * by any one of its effects being hostile, so a script that zeroes one never
 * hides the module; a friendly remote tracking computer or sensor booster
 * (the same attributes, positive) is not support this reads.
 */
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
  // A bigger explosion is the hostile direction for its radius.
  if (hostile(guidance, (e) => (e.effect === 'explosionRadius' ? e.amount > 0 : e.amount < 0)))
    return ewar('guidanceDisruptor', guidance);
  return null;
}

/** `items`/`results` are the index-parallel `dogmaFit.items` and `calculation.items`. */
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
    const optimal = read(SUPPORT_ATTRIBUTE.optimal);
    // Only a module that reaches another ship has an optimal range.
    if (optimal <= 0) return;
    const what = classifySupport(read);
    if (!what) return;
    // A scripted module and an unscripted one of the same type do different
    // things, so each set of effects is a row of its own.
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
