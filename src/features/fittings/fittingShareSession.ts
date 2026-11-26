import type { Fitting } from '@/engine/fittings/types';

export interface OwnWrite {
  code: string | null;
  fitting: Fitting | null;
}

export interface PendingOpen {
  code: string;
  name: string;
}

export interface ShareCodeChangeInput {
  ownWrite: OwnWrite | null;
  pendingOpen: PendingOpen | null;
  shareCode: string | null;
}

export interface ShareCodeChangeDecision {
  isDifferentFitting: boolean;
  resetSavedId: boolean;
  adopted: Fitting | null;
}

export function resolveShareCodeChange({
  ownWrite,
  pendingOpen,
  shareCode,
}: ShareCodeChangeInput): ShareCodeChangeDecision {
  const isDifferentFitting = ownWrite?.code !== shareCode;
  const resetSavedId = isDifferentFitting && pendingOpen?.code !== shareCode;
  const adopted = ownWrite?.code === shareCode ? ownWrite.fitting : null;
  return { isDifferentFitting, resetSavedId, adopted };
}

export interface CoalesceRun {
  key: string;
  at: number;
}

export interface CoalesceDecision {
  coalesce: boolean;
  next: CoalesceRun | null;
}

export function resolveCoalesce(
  last: CoalesceRun | null,
  coalesceKey: string | undefined,
  now: number,
  windowMs: number
): CoalesceDecision {
  const coalesce =
    coalesceKey !== undefined &&
    last !== null &&
    last.key === coalesceKey &&
    now - last.at < windowMs;
  const next = coalesceKey === undefined ? null : { key: coalesceKey, at: now };
  return { coalesce, next };
}
