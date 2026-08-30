// Firebase uid for an EVE character. Kept in its own Firebase-free module so
// index.ts can re-export it synchronously without pulling firebase/auth (and
// the rest of the sync driver) into the entry chunk. The Cloud Function has
// its own copy (functions/src/verifyEveToken.ts) — the two must agree.

export function uidForCharacter(characterId: number): string {
  return `char:${characterId}`;
}
