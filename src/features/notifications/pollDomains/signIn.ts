import type {
  CharacterNeedsLoginFire,
  SignInEntrySnapshot,
  SignInSnapshot,
} from '@/engine/notificationDiffs';
import { needsLoginIds } from '@/stores/authFailure';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

/* Character needs to log in again ------------------------------------------ */

const isSignInEntrySnapshot = shapeGuard<SignInEntrySnapshot>({
  needsLogin: is.oneOf([true] as const),
});

/**
 * Reads the device's needs-login mark (issue #6091), not ESI: the mark is
 * set by the token failures every other domain's fetches already run into.
 * Listed last in `POLL_DOMAINS`, so a failure earlier in the same poll is
 * reported by that poll.
 */
export const signInDomain = defineDomain<
  SignInEntrySnapshot,
  SignInSnapshot,
  CharacterNeedsLoginFire
>({
  source: SNAPSHOT_SOURCES.signIn,
  stateKey: 'notifications.pollerState.signIn',
  entriesKey: 'entries',
  isEntry: isSignInEntrySnapshot,
  load: async (characterId) =>
    (await needsLoginIds()).includes(characterId) ? [{ needsLogin: true }] : [],
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
});
