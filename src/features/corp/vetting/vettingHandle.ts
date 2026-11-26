import { isRecord } from '@/engine/guards';
import type { VettingHandle } from './vettingBackend';

export type VettingHandleSlot = `apply:${number}` | `request:${number}`;

const PREFIX = 'neocom.vetting.';

export function readVettingHandle(slot: VettingHandleSlot): VettingHandle | null {
  try {
    const raw = localStorage.getItem(PREFIX + slot);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      typeof parsed.corporationId !== 'number' ||
      typeof parsed.reviewId !== 'string' ||
      typeof parsed.key !== 'string'
    ) {
      return null;
    }
    return { corporationId: parsed.corporationId, reviewId: parsed.reviewId, key: parsed.key };
  } catch {
    return null;
  }
}

export function writeVettingHandle(slot: VettingHandleSlot, handle: VettingHandle): void {
  try {
    localStorage.setItem(PREFIX + slot, JSON.stringify(handle));
  } catch {}
}

export function clearVettingHandle(slot: VettingHandleSlot): void {
  try {
    localStorage.removeItem(PREFIX + slot);
  } catch {}
}
