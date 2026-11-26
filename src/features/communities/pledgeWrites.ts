const edits = new Map<string, number>();
const editKey = (characterId: number, communityId: string) => `${characterId}:${communityId}`;

export const pledgeEditVersion = (characterId: number, communityId: string) =>
  edits.get(editKey(characterId, communityId)) ?? 0;

export function notePledgeEdit(characterId: number, communityId: string): void {
  edits.set(editKey(characterId, communityId), pledgeEditVersion(characterId, communityId) + 1);
}

let tail: Promise<unknown> = Promise.resolve();

export function underFirebaseSession<T>(operation: () => Promise<T>): Promise<T> {
  const run = tail.then(operation, operation);
  tail = run.catch(() => undefined);
  return run;
}
