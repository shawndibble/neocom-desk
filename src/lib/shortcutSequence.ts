/**
 * The "g then a letter" shortcut state machine, pure so it tests without a DOM
 * or timers: the pending prefix carries the time it was pressed, and expires
 * lazily when the next key's time is compared against it.
 */
export const SEQUENCE_PREFIX = 'g';
export const SEQUENCE_TIMEOUT_MS = 1500;

export interface SequenceState {
  readonly pendingSince: number | null;
}

export const IDLE: SequenceState = { pendingSince: null };

export type SequenceResult =
  /** The prefix was pressed; the next key may complete it. */
  | { kind: 'pending'; state: SequenceState }
  /** A known second key completed the sequence. */
  | { kind: 'match'; key: string; state: SequenceState }
  /** Not part of a sequence; any pending prefix is dropped. */
  | { kind: 'ignore'; state: SequenceState };

/**
 * `key` is already lower-cased; `now` is any monotonic millisecond clock.
 * Any key but a known second one cancels, so a stray `g` never lies in wait.
 */
export function advanceSequence(
  state: SequenceState,
  key: string,
  now: number,
  isSecondKey: (key: string) => boolean
): SequenceResult {
  const live = state.pendingSince !== null && now - state.pendingSince <= SEQUENCE_TIMEOUT_MS;
  if (key === SEQUENCE_PREFIX) return { kind: 'pending', state: { pendingSince: now } };
  if (live && isSecondKey(key)) return { kind: 'match', key, state: IDLE };
  return { kind: 'ignore', state: IDLE };
}
