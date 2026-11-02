/**
 * A Character's cerebral accelerator (GLOSSARY.md **Accelerator**): what the
 * pilot typed in, else what the attribute sheet implies. Pure.
 *
 * No ESI endpoint says an accelerator is running, so the only way to know when
 * it ends is the pilot's own answer. A typed-in one wins while it has not run
 * out; once it has, it counts as gone (the stored record is deleted by
 * `features/accelerator`) and detection from the attribute sheet applies again.
 */

export interface TypedAccelerator {
  bonus: number;
  /** Epoch ms it runs out. */
  expiresAt: number;
}

export type ResolvedAccelerator =
  | { kind: 'manual'; bonus: number; expiresAt: number }
  | { kind: 'detected'; bonus: number }
  | { kind: 'none' };

/** Whether a typed-in accelerator is still running at `nowMs`. */
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
