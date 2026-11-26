export const SEQUENCE_PREFIX = 'g';
export const SEQUENCE_TIMEOUT_MS = 1500;

export interface SequenceState {
  readonly pendingSince: number | null;
}

export const IDLE: SequenceState = { pendingSince: null };

export type SequenceResult =
  | { kind: 'pending'; state: SequenceState }
  | { kind: 'match'; key: string; state: SequenceState }
  | { kind: 'ignore'; state: SequenceState };

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
