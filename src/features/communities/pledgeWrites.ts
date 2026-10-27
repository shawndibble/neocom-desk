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
 * then reads or writes under that session.
 */
let tail: Promise<unknown> = Promise.resolve();

export function underFirebaseSession<T>(operation: () => Promise<T>): Promise<T> {
  const run = tail.then(operation, operation);
  tail = run.catch(() => undefined);
  return run;
}
