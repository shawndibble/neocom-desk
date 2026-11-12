/**
 * The dead-login alert (issue #6091): a Character whose refresh grant EVE
 * refused stops being polled, so every other alert for it goes quiet. The
 * snapshot is the needs-sign-in mark (`stores/authFailure.ts`) as this poll
 * read it: one entry while the mark is set, none once a sign-in clears it.
 */
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
  /** The poll that first saw the mark: what tells one failure from the next. */
  sinceMs: number;
}

/**
 * Fires on the edge into the mark, so a login that stays dead is one alert,
 * not one per poll. Unlike the history diffs, no baseline still fires: the
 * mark is current state, and the first poll after an upgrade is exactly when
 * a pilot most needs to hear that a login is already dead.
 */
export function diffCharacterNeedsLogin(
  characterId: number,
  prev: SignInSnapshot | undefined,
  next: SignInSnapshot
): CharacterNeedsLoginFire[] {
  if (next.entries.length === 0 || (prev?.entries.length ?? 0) > 0) return [];
  return [{ eventId: 'characterNeedsLogin', characterId, sinceMs: next.nowMs }];
}
