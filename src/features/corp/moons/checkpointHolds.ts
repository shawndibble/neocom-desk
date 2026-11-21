import { useSyncExternalStore } from 'react';

/**
 * Per book, the Miners whose closed-month checkpoint the last `recordCheckpoints` skipped, with the
 * server's reason. Their accounts are read whole meanwhile, which is no error, so they are said
 * quietly: a Director's approval in Needs you, every other reason as a note in book health.
 */
export interface CheckpointSkip {
  minerId: string;
  reason: string;
}

const skippedByBook = new Map<number, readonly CheckpointSkip[]>();
const listeners = new Set<() => void>();
const NONE: readonly CheckpointSkip[] = [];
const NO_IDS: readonly string[] = [];
const directorIds = new Map<number, readonly string[]>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

/** The checkpoints the server skipped in this book, as this tab last heard. */
export function useCheckpointSkips(corporationId: number): readonly CheckpointSkip[] {
  return useSyncExternalStore(subscribe, () => skippedByBook.get(corporationId) ?? NONE);
}

/** The Miners whose checkpoint waits on a Director in this book, as this tab last heard. */
export function useCheckpointsAwaitingDirector(corporationId: number): readonly string[] {
  return useSyncExternalStore(subscribe, () => directorIds.get(corporationId) ?? NO_IDS);
}

/** What the last `recordCheckpoints` skipped, per book. */
export function noteCheckpointSkips(corporationId: number, skipped: readonly CheckpointSkip[]) {
  const before = skippedByBook.get(corporationId) ?? NONE;
  const same =
    before.length === skipped.length &&
    before.every((s, i) => s.minerId === skipped[i]!.minerId && s.reason === skipped[i]!.reason);
  if (same) return;
  skippedByBook.set(corporationId, skipped);
  directorIds.set(
    corporationId,
    skipped.filter((s) => s.reason === 'director-approval').map((s) => s.minerId)
  );
  for (const listener of listeners) listener();
}
