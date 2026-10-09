/**
 * A Local list row's Threat level, split from `pilotListData` so the view can
 * read it without pulling in the loader (which its tests replace wholesale).
 */
import { threatVerdict, type ThreatLevel } from '@/engine/pilotList/threatVerdict';
import type { PilotListRow } from './pilotListData';

/**
 * A row's Threat level, `pending` while its danger ratio is still on the way
 * (the level could still change), and null for a row with no kill list to
 * read: friendly, not found, still loading or unreachable.
 */
export function rowThreat(row: PilotListRow, nowMs: number): ThreatLevel | 'pending' | null {
  if (row.kills.kind !== 'ready') return null;
  if (row.danger.kind === 'loading') return 'pending';
  return threatVerdict({
    kills: row.kills.kills,
    dangerRatio: row.danger.kind === 'ready' ? row.danger.ratio : null,
    nowMs,
  }).level;
}
