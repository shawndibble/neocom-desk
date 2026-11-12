/**
 * Where a pilot's `VettingHandle` is kept between visits, so a reload or a return to the apply
 * link finds the application. `localStorage`, per slot: `apply:<corporationId>` for an
 * application, `request:<characterId>` for a member's shared review. The key in it opens that
 * one report's status and nothing else; no EVE token is ever stored here. Every access is
 * guarded, and the pages work without it (a pilot then starts again).
 */
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
  } catch {
    // Without storage the page still works until it is closed.
  }
}

export function clearVettingHandle(slot: VettingHandleSlot): void {
  try {
    localStorage.removeItem(PREFIX + slot);
  } catch {
    // Nothing to forget.
  }
}
