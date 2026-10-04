/**
 * Cargo Space for the Hauling Opportunities page: the holds the hauler can
 * fill, each with its own m³, chosen once and remembered on this device.
 *
 * Three ways to say it, easiest first — a hull (its base holds), a saved
 * Fitting (the exact holds, skills and expanders included) or a typed number,
 * which is one hold of a chosen kind ("Any item" by default).
 * The first two run the dogma engine, so they are loaded on demand rather
 * than when the page opens; a hull is a bare Fitting with nothing fitted.
 *
 * The choice is a device-local preference, never synced: like the Market
 * Browser's hub, it describes the ship at this desk.
 */
import type { FittingRecord } from '@/db';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import { newFitting } from '@/engine/fittings/fittingEdit';
import { isHoldKind, type CargoHold } from '@/engine/market/cargoHolds';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface HaulingCargo {
  /** What the user picked, for the control's label: a hull name, a fitting name, or "Custom". */
  label: string;
  holds: CargoHold[];
}

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * A saved Cargo Space. A value saved before holds (`{ label, m3 }`) reads as
 * one "Any item" hold — what it always meant, a ship's or a typed number alike.
 */
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

/** Every hold's m³ added up, for the control's label. */
export function totalCargoM3(cargo: HaulingCargo): number {
  return cargo.holds.reduce((sum, h) => sum + h.capacityM3, 0);
}

export const useHaulingCargo = createLocalSetting<HaulingCargo | null>({
  key: 'haulingCargo',
  defaultValue: null,
  parse: parseCargo,
});

/** ISK the hauler will spend on one load; null (the default) is no limit. */
export const useHaulingBudget = createLocalSetting<number | null>({
  key: 'haulingBudget',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null),
});

/** The dogma engine, imported lazily: it is a large asset most visits to the page never need. */
async function cargoOf(fitting: Fitting, profile: PilotProfile): Promise<CargoHold[]> {
  const { computeCargoHolds } = await import('./haulingFittingStats');
  return computeCargoHolds(fitting, profile);
}

/** A hull's own holds, for a pilot with these skills. */
export function hullCargoHolds(hullTypeId: number, profile: PilotProfile): Promise<CargoHold[]> {
  return cargoOf(newFitting(hullTypeId, ''), profile);
}

/** A saved Fitting's holds, or null when its share code no longer decodes. */
export async function fittingCargoHolds(
  record: FittingRecord,
  profile: PilotProfile
): Promise<CargoHold[] | null> {
  const decoded = await decodeFittingShare(record.code);
  if (!decoded.ok) return null;
  return cargoOf(shareToFitting({ ...decoded.value, name: record.name }, record.name), profile);
}
