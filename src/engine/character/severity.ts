import { DAY_MS, HOUR_MS } from '@/lib/age';

export const DEADLINE_SEVERITIES = ['critical', 'warning', 'watch', 'clear'] as const;

export type DeadlineSeverity = (typeof DEADLINE_SEVERITIES)[number];

const RANK: Record<DeadlineSeverity, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  clear: 3,
};

export function compareSeverity(a: DeadlineSeverity, b: DeadlineSeverity): number {
  return RANK[a] - RANK[b];
}

export function worstSeverity(severities: readonly DeadlineSeverity[]): DeadlineSeverity {
  let worst: DeadlineSeverity = 'clear';
  for (const severity of severities) {
    if (RANK[severity] < RANK[worst]) worst = severity;
  }
  return worst;
}

export type SeverityProfile = 'default' | 'logistics';

export function severityForRemaining(
  remainingMs: number | null,
  profile: SeverityProfile = 'default'
): DeadlineSeverity {
  if (remainingMs === null) return 'warning';
  if (profile === 'logistics') {
    if (remainingMs <= 24 * HOUR_MS) return 'critical';
    if (remainingMs <= 3 * DAY_MS) return 'warning';
    if (remainingMs <= 7 * DAY_MS) return 'watch';
    return 'clear';
  }
  if (remainingMs <= HOUR_MS) return 'critical';
  if (remainingMs <= 24 * HOUR_MS) return 'warning';
  return 'clear';
}
