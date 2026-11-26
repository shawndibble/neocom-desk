import type { FittingRecord } from '@/db';
import { decodeFittingShare } from '@/engine/fittings/fittingShare';
import { newFitting } from '@/engine/fittings/fittingEdit';
import { isHoldKind, type CargoHold } from '@/engine/market/cargoHolds';
import type { PackHold } from '@/engine/assets/haulPacking';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface HaulingCargo {
  label: string;
  holds: CargoHold[];
}

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function parseCargo(raw: unknown): HaulingCargo | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { label, m3, holds } = raw as Record<string, unknown>;
  if (typeof label !== 'string') return null;
  if (holds === undefined) {
    return isPositive(m3) ? { label, holds: [{ kind: 'general', capacityM3: m3 }] } : null;
  }
  if (!Array.isArray(holds)) return null;
  const parsed = holds.flatMap((hold: unknown) => {
    if (hold === null || typeof hold !== 'object') return [];
    const { kind, capacityM3 } = hold as Record<string, unknown>;
    return isHoldKind(kind) && isPositive(capacityM3) ? [{ kind, capacityM3 }] : [];
  });
  return parsed.length > 0 ? { label, holds: parsed } : null;
}

export function totalCargoM3(cargo: HaulingCargo): number {
  return cargo.holds.reduce((sum, h) => sum + h.capacityM3, 0);
}

export const useHaulingCargo = createLocalSetting<HaulingCargo | null>({
  key: 'haulingCargo',
  defaultValue: null,
  parse: parseCargo,
});

export const useHaulingBudget = createLocalSetting<number | null>({
  key: 'haulingBudget',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null),
});

async function cargoOf(fitting: Fitting, profile: PilotProfile): Promise<CargoHold[]> {
  const { computeCargoHolds } = await import('./haulingFittingStats');
  return computeCargoHolds(fitting, profile);
}

export function hullCargoHolds(hullTypeId: number, profile: PilotProfile): Promise<CargoHold[]> {
  return cargoOf(newFitting(hullTypeId, ''), profile);
}

export async function hullPackHolds(
  hullTypeId: number,
  profile: PilotProfile
): Promise<PackHold[]> {
  const { computePackHolds } = await import('./haulingFittingStats');
  return computePackHolds(newFitting(hullTypeId, ''), profile);
}

export async function fittingCargoHolds(
  record: FittingRecord,
  profile: PilotProfile
): Promise<CargoHold[] | null> {
  const decoded = await decodeFittingShare(record.code);
  if (!decoded.ok) return null;
  return cargoOf(shareToFitting({ ...decoded.value, name: record.name }, record.name), profile);
}
