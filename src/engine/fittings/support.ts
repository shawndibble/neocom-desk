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
  trackingSpeedBonus: 767,
  maxTargetRangeBonus: 309,
  aoeVelocityBonus: 847,
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

/** What one running, projected module does, as a kind and an amount. */
function classify(read: (id: number) => number): { kind: SupportKind; amount: number } | null {
  const A = SUPPORT_ATTRIBUTE;
  if (read(A.shieldBoostRate) > 0) return { kind: 'remoteShield', amount: read(A.shieldBoostRate) };
  if (read(A.armorRepairRate) > 0) return { kind: 'remoteArmor', amount: read(A.armorRepairRate) };
  if (read(A.hullRepairRate) > 0) return { kind: 'remoteHull', amount: read(A.hullRepairRate) };
  const transfer = read(A.capacitorTransferRate);
  if (transfer > 0) {
    if (read(A.energyNeutralizerAmount) > 0) return { kind: 'neutralizer', amount: transfer };
    if (read(A.capacitorPeakLoad) < 0) return { kind: 'nosferatu', amount: transfer };
    return { kind: 'capTransfer', amount: transfer };
  }
  if (read(A.speedFactor) < 0) return { kind: 'web', amount: -read(A.speedFactor) };
  if (read(A.warpScrambleStrength) > 0)
    return { kind: 'warpDisruption', amount: read(A.warpScrambleStrength) };
  const jam = Math.max(
    read(A.ecmGravimetric),
    read(A.ecmLadar),
    read(A.ecmMagnetometric),
    read(A.ecmRadar)
  );
  if (jam > 0) return { kind: 'ecm', amount: jam };
  if (read(A.signatureRadiusBonus) > 0)
    return { kind: 'targetPainter', amount: read(A.signatureRadiusBonus) };
  if (read(A.trackingSpeedBonus) < 0)
    return { kind: 'trackingDisruptor', amount: -read(A.trackingSpeedBonus) };
  if (read(A.maxTargetRangeBonus) < 0)
    return { kind: 'sensorDampener', amount: -read(A.maxTargetRangeBonus) };
  if (read(A.aoeVelocityBonus) < 0)
    return { kind: 'guidanceDisruptor', amount: -read(A.aoeVelocityBonus) };
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
    const what = classify(read);
    if (!what) return;
    const key = `${what.kind}:${item.type_id}`;
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
