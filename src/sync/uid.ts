// Firebase uid for an EVE character. Its own Firebase-free module so index.ts
// can re-export it synchronously. The Cloud Function has its own copy
// (functions/src/verifyEveToken.ts) — the two must agree.

export function uidForCharacter(characterId: number): string {
  return `char:${characterId}`;
}
