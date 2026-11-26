import type { PilotStats } from '@/lib/zkillboard';
import { formatNumber } from '@/lib/numberLocale';

export interface StatTileItem {
  label: string;
  value: string;
  isk?: number;
  help?: string;
  tone?: 'positive' | 'negative';
}

export function killerRatio(s: Pick<PilotStats, 'kills' | 'losses'>): number | null {
  const total = s.kills + s.losses;
  if (total === 0) return null;
  const share = Math.round((s.kills / total) * 100);
  if (s.kills > 0 && s.losses > 0) return Math.min(99, Math.max(1, share));
  return share;
}

export function killFigures(
  t: (key: string) => string,
  s: PilotStats | null
): Record<'kills' | 'losses' | 'iskDestroyed' | 'iskLost', StatTileItem> {
  return {
    kills: {
      label: t('travel.pilot.kills'),
      value: s ? formatNumber(s.kills) : '—',
      tone: s ? 'positive' : undefined,
    },
    losses: {
      label: t('travel.pilot.losses'),
      value: s ? formatNumber(s.losses) : '—',
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
