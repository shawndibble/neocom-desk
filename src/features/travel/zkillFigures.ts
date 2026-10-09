/**
 * The tile data the zKillboard parts render (`ZkillStatsSection.tsx`), kept
 * apart from the components so the module they live in exports components
 * only.
 */
import type { PilotStats } from '@/lib/zkillboard';

export interface StatTileItem {
  label: string;
  value: string;
  /** An ISK figure: rendered as an `IskAmount` (compact, exact on hover) in place of `value`. */
  isk?: number;
  /** A one-line explanation behind a "?" beside the label. */
  help?: string;
  /** Colours the value: kills read green, losses red (decision `20261002-163430`). */
  tone?: 'positive' | 'negative';
}

/**
 * Kills as a 0-100 share of kills and losses, by ship count: how much of a
 * pilot's record is killing rather than dying (1 to 99 while there is both). Not zKillboard's danger ratio,
 * which weights each ship by size; null with neither a kill nor a loss.
 */
export function killerRatio(s: Pick<PilotStats, 'kills' | 'losses'>): number | null {
  const total = s.kills + s.losses;
  if (total === 0) return null;
  const share = Math.round((s.kills / total) * 100);
  // A record with both is never all one thing: 300 kills to 1 loss is 99, not a full bar.
  if (s.kills > 0 && s.losses > 0) return Math.min(99, Math.max(1, share));
  return share;
}

/** The figures zKillboard gives for anyone: kills and losses in ships and in ISK. */
export function killFigures(
  t: (key: string) => string,
  s: PilotStats | null
): Record<'kills' | 'losses' | 'iskDestroyed' | 'iskLost', StatTileItem> {
  return {
    kills: {
      label: t('travel.pilot.kills'),
      value: s ? s.kills.toLocaleString() : '—',
      tone: s ? 'positive' : undefined,
    },
    losses: {
      label: t('travel.pilot.losses'),
      value: s ? s.losses.toLocaleString() : '—',
      tone: s ? 'negative' : undefined,
    },
    iskDestroyed: {
      label: t('travel.pilot.iskDestroyed'),
      value: '—',
      isk: s?.iskDestroyed,
    },
    iskLost: { label: t('travel.pilot.iskLost'), value: '—', isk: s?.iskLost },
  };
}
