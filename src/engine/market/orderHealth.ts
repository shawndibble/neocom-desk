import { parseInstant } from '../esiInstant';
import { DAY_MS } from '@/lib/age';

export interface OrderExpiry {
  expiresAt: number;
  daysLeft: number;
  expired: boolean;
}

export function orderExpiry(issued: string, durationDays: number, now: number): OrderExpiry | null {
  const issuedMs = parseInstant(issued);
  if (issuedMs === null) return null;
  if (!Number.isFinite(durationDays) || durationDays < 0) return null;

  const expiresAt = issuedMs + durationDays * DAY_MS;
  const daysLeft = Math.trunc((expiresAt - now) / DAY_MS);

  return { expiresAt, daysLeft, expired: expiresAt <= now };
}

export type SellThrough =
  | { kind: 'known'; unitsPerDay: number; daysToClear: number }
  | { kind: 'unknown'; reason: 'noSales' | 'noHistory' };

export interface SellThroughInputs {
  volumeRemain: number;
  regionUnitsPerDay: number;
  myShare: number;
  hasHistory?: boolean;
}

export function sellThrough(inputs: SellThroughInputs): SellThrough {
  const { volumeRemain, regionUnitsPerDay, hasHistory } = inputs;

  if (hasHistory === false) return { kind: 'unknown', reason: 'noHistory' };

  const myShare = Math.min(1, Math.max(0, inputs.myShare));
  const unitsPerDay = regionUnitsPerDay * myShare;

  if (unitsPerDay === 0) return { kind: 'unknown', reason: 'noSales' };

  return { kind: 'known', unitsPerDay, daysToClear: Math.ceil(volumeRemain / unitsPerDay) };
}
