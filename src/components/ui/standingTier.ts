/**
 * The five standing tiers EVE draws a colour tag for, worst to best.
 *
 * Its own module rather than living beside `StandingIcon`: a file that
 * exports both a component and a plain function loses React Fast Refresh,
 * which is why `buttonClassName.ts` and `controlStyles.ts` sit apart from
 * their components too.
 */
export type StandingTier = 'terrible' | 'bad' | 'neutral' | 'good' | 'excellent';

/**
 * Contact standings are set at five fixed values in game (±10, ±5, 0), so the
 * boundaries put +5 in "good" and -5 in "bad" — what the in-game contact list
 * shows for those rows. The wider ranges are for the continuous standings
 * (NPC corp/faction) the same tags are used for elsewhere.
 */
export function standingTier(standing: number): StandingTier {
  if (standing > 5) return 'excellent';
  if (standing > 0) return 'good';
  if (standing === 0) return 'neutral';
  if (standing >= -5) return 'bad';
  return 'terrible';
}
