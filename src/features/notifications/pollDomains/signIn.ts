import type {
  CharacterNeedsLoginFire,
  SignInEntrySnapshot,
  SignInSnapshot,
} from '@/engine/notificationDiffs';
import { needsLoginIds } from '@/stores/authFailure';
import { SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

const isSignInEntrySnapshot = shapeGuard<SignInEntrySnapshot>({
  needsLogin: is.oneOf([true] as const),
});

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
