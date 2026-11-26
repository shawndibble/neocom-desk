import { fail } from './actorAuth.js';
import type { Firestore } from 'firebase-admin/firestore';
import { CORPS_COLLECTION, SRP_THROTTLE } from './srpTypes.js';

export const FETCH_LIMIT = 20;
export const FETCH_WINDOW_MS = 60_000;

export interface ThrottleState {
  windowStart: number;
  count: number;
}

export function nextThrottle(
  state: ThrottleState | undefined,
  now: number
): { allowed: boolean; state: ThrottleState } {
  if (!state || now - state.windowStart >= FETCH_WINDOW_MS) {
    return { allowed: true, state: { windowStart: now, count: 1 } };
  }
  if (state.count >= FETCH_LIMIT) return { allowed: false, state };
  return { allowed: true, state: { windowStart: state.windowStart, count: state.count + 1 } };
}

export async function takeFetchSlot(
  deps: { db: Firestore; now: () => number },
  corporationId: number,
  characterId: number
): Promise<void> {
  const ref = deps.db
    .collection(CORPS_COLLECTION)
    .doc(String(corporationId))
    .collection(SRP_THROTTLE)
    .doc(String(characterId));
  const allowed = await deps.db.runTransaction(async (tx) => {
    const step = nextThrottle((await tx.get(ref)).data() as ThrottleState | undefined, deps.now());
    if (step.allowed) tx.set(ref, step.state);
    return step.allowed;
  });
  if (!allowed) {
    fail(
      'resource-exhausted',
      'Too many killmail lookups; wait a minute and try again',
      'rate-limited'
    );
  }
}
