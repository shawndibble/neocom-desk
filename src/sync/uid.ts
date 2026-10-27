// Firebase uid for an EVE character. Its own Firebase-free module so index.ts
// can re-export it synchronously. The Cloud Function has its own copy
// (functions/src/verifyEveToken.ts) — the two must agree.

export function uidForCharacter(characterId: number): string {
  return `char:${characterId}`;
}

/** The EVE character id a uid was made from, or null for a uid of any other shape. */
export function characterIdForUid(uid: string): number | null {
  const match = /^char:(\d+)$/.exec(uid);
  return match ? Number(match[1]) : null;
}
