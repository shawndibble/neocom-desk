export function uidForCharacter(characterId: number): string {
  return `char:${characterId}`;
}

export function characterIdForUid(uid: string): number | null {
  const match = /^char:(\d+)$/.exec(uid);
  return match ? Number(match[1]) : null;
}
