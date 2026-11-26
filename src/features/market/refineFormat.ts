import { formatPercent } from '@/features/refining/formatPercent';

export function pct(fraction: number): string {
  return formatPercent(fraction);
}

export function efficiencyText(min: number | null, max: number | null): string {
  if (min === null || max === null) return '—';
  return min === max ? pct(min) : `${pct(min)} – ${pct(max)}`;
}

export function skillsText(min: number | null, max: number | null, yieldRate: number): string {
  if (min === null || max === null || yieldRate <= 0) return '—';
  const low = (min / yieldRate).toFixed(3);
  const high = (max / yieldRate).toFixed(3);
  return low === high ? `×${low}` : `×${low} – ${high}`;
}
