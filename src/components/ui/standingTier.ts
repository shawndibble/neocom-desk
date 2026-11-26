export type StandingTier = 'terrible' | 'bad' | 'neutral' | 'good' | 'excellent';

export function standingTier(standing: number): StandingTier {
  if (standing > 5) return 'excellent';
  if (standing > 0) return 'good';
  if (standing === 0) return 'neutral';
  if (standing >= -5) return 'bad';
  return 'terrible';
}
