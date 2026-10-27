/**
 * The device-local draft of a Fitting too large for a Fitting Share Code
 * (issue #2954). Such a Fitting writes no `?f=`, so without this a reload
 * loses it. The draft lives in the `settings` table under a key that is not
 * on the synced-settings allow-list, so it stays on this device and out of
 * backups. It holds at most one Fitting: the oversized one currently open.
 */
import { db } from '@/db';
import type { Fitting } from '@/engine/fittings/types';

const DRAFT_KEY = 'fittingDraft';

/** The stored Fitting, or null for anything that doesn't have a Fitting's shape. */
export function parseFittingDraft(value: unknown): Fitting | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<Fitting>;
  const valid =
    typeof v.name === 'string' &&
    typeof v.shipTypeId === 'number' &&
    Array.isArray(v.modules) &&
    Array.isArray(v.drones) &&
    Array.isArray(v.cargo);
  return valid ? (value as Fitting) : null;
}

export async function readFittingDraft(): Promise<Fitting | null> {
  return parseFittingDraft((await db.settings.get(DRAFT_KEY))?.value);
}

export async function writeFittingDraft(fitting: Fitting): Promise<void> {
  await db.settings.put({ key: DRAFT_KEY, value: fitting });
}

export async function clearFittingDraft(): Promise<void> {
  await db.settings.delete(DRAFT_KEY);
}
