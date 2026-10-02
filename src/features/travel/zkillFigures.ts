/**
 * The tile data the zKillboard parts render (`ZkillStatsSection.tsx`), kept
 * apart from the components so the module they live in exports components
 * only.
 */
import { formatIskCompact } from '@/lib/isk';
import type { PilotStats } from '@/lib/zkillboard';

export interface StatTileItem {
  label: string;
  value: string;
  /** A one-line explanation behind a "?" beside the label. */
  help?: string;
  /** Colours the value: kills and ISK destroyed read green, losses red. */
  tone?: 'positive' | 'negative';
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
      value: s ? formatIskCompact(s.iskDestroyed) : '—',
    },
    iskLost: { label: t('travel.pilot.iskLost'), value: s ? formatIskCompact(s.iskLost) : '—' },
  };
}
