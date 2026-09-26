/**
 * Cargo Space for the Hauling Opportunities page: how many m³ the hauler can
 * carry, chosen once and remembered on this device.
 *
 * Three ways to say it, easiest first — a hull (its base hold), a saved
 * Fitting (the exact hold, skills and expanders included) or a typed number.
 * The first two run the dogma engine, so they are loaded on demand rather
 * than when the page opens; a hull is a bare Fitting with nothing fitted.
 *
 * The choice is a device-local preference, never synced: like the Market
 * Browser's hub, it describes the ship at this desk.
 */
import type { FittingRecord } from '@/db';
import { decodeFittingShare } from '@/engine/fitting/fittingShare';
import { newFitting } from '@/engine/fittings/fittingEdit';
import { shareToFitting } from '@/engine/fittings/shareMapper';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface HaulingCargo {
  /** What the user picked, for the control's label: a hull name, a fitting name, or "Custom". */
  label: string;
  m3: number;
}

function parseCargo(raw: unknown): HaulingCargo | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { label, m3 } = raw as Record<string, unknown>;
  return typeof label === 'string' && typeof m3 === 'number' && Number.isFinite(m3) && m3 > 0
    ? { label, m3 }
    : null;
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
async function cargoOf(fitting: Fitting, profile: PilotProfile): Promise<number> {
  const { computeCargoM3 } = await import('./haulingFittingStats');
  return computeCargoM3(fitting, profile);
}

/** A hull's own hold, for a pilot with these skills. */
export function hullCargoM3(hullTypeId: number, profile: PilotProfile): Promise<number> {
  return cargoOf(newFitting(hullTypeId, ''), profile);
}

/** A saved Fitting's hold, or null when its share code no longer decodes. */
export async function fittingCargoM3(
  record: FittingRecord,
  profile: PilotProfile
): Promise<number | null> {
  const decoded = await decodeFittingShare(record.code);
  if (!decoded.ok) return null;
  return cargoOf(shareToFitting({ ...decoded.value, name: record.name }, record.name), profile);
}
