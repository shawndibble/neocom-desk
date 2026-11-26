export interface SignInEntrySnapshot {
  needsLogin: true;
}

export interface SignInSnapshot {
  entries: readonly SignInEntrySnapshot[];
  nowMs: number;
}

export interface CharacterNeedsLoginFire {
  eventId: 'characterNeedsLogin';
  characterId: number;
  sinceMs: number;
}

export function diffCharacterNeedsLogin(
  characterId: number,
  prev: SignInSnapshot | undefined,
  next: SignInSnapshot
): CharacterNeedsLoginFire[] {
  if (next.entries.length === 0 || (prev?.entries.length ?? 0) > 0) return [];
  return [{ eventId: 'characterNeedsLogin', characterId, sinceMs: next.nowMs }];
}
