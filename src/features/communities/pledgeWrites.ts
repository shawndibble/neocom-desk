/**
 * Pledge writes in flight from the Request panel. A write goes out under the
 * Firebase session of its Character; the background delivery sweep signs in
 * as each Character in turn, which would swap that session under the write.
 * The sweep checks `pledgeWritesInFlight` and leaves the other Characters for
 * its next run.
 */
let inFlight = 0;

export const pledgeWritesInFlight = () => inFlight;

/** Runs `write`, counted as in flight until it settles. */
export async function trackPledgeWrite<T>(write: () => Promise<T>): Promise<T> {
  inFlight += 1;
  try {
    return await write();
  } finally {
    inFlight -= 1;
  }
}

const edits = new Map<string, number>();
const editKey = (characterId: number, communityId: string) => `${characterId}:${communityId}`;

/** How many times the Member has edited a Pledge by hand here (a Pledge, a typed amount, a withdrawal). */
export const pledgeEditVersion = (characterId: number, communityId: string) =>
  edits.get(editKey(characterId, communityId)) ?? 0;

/**
 * Called around every hand edit of a Pledge. A delivery run that began before
 * it read the Pledge as it was, so it must not be joined and must not write.
 */
export function notePledgeEdit(characterId: number, communityId: string): void {
  edits.set(editKey(characterId, communityId), pledgeEditVersion(characterId, communityId) + 1);
}

/**
 * One at a time for everything that signs in to Firebase as a Character and
 * then reads or writes under that session. The background sweep signs in as
 * each Character in turn, which swaps the session: it must never land between
 * another operation's sign-in and its read or write.
 */
let tail: Promise<unknown> = Promise.resolve();

export function underFirebaseSession<T>(operation: () => Promise<T>): Promise<T> {
  const run = tail.then(operation, operation);
  tail = run.catch(() => undefined);
  return run;
}
