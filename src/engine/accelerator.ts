import { HOUR_MS } from '@/lib/age';
import type { DeadlineSeverity } from './character/severity';

export interface TypedAccelerator {
  bonus: number;
  expiresAt: number;
}

export type ResolvedAccelerator =
  | { kind: 'manual'; bonus: number; expiresAt: number }
  | { kind: 'detected'; bonus: number }
  | { kind: 'none' };

export function isAcceleratorLive(
  record: Pick<TypedAccelerator, 'expiresAt'> | null | undefined,
  nowMs: number
): boolean {
  return record !== null && record !== undefined && record.expiresAt > nowMs;
}

export function resolveAccelerator(
  record: TypedAccelerator | null | undefined,
  detectedBonus: number | null | undefined,
  nowMs: number
): ResolvedAccelerator {
  if (record && isAcceleratorLive(record, nowMs)) {
    return { kind: 'manual', bonus: record.bonus, expiresAt: record.expiresAt };
  }
  if (detectedBonus !== null && detectedBonus !== undefined && detectedBonus > 0) {
    return { kind: 'detected', bonus: detectedBonus };
  }
  return { kind: 'none' };
}

const ACCELERATOR_WARNING_HOURS = 2;

export function acceleratorSeverity(remainingMs: number): DeadlineSeverity {
  return remainingMs <= ACCELERATOR_WARNING_HOURS * HOUR_MS ? 'warning' : 'clear';
}
