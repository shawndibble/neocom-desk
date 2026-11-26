import {
  needsLossHistory,
  threatVerdict,
  type ThreatLevel,
} from '@/engine/pilotList/threatVerdict';
import {
  threatInContext,
  type ThreatContext,
  type ThreatRead,
} from '@/engine/pilotList/threatContext';
import type { PilotListRow } from './pilotListData';

export function rowThreatRead(
  row: PilotListRow,
  nowMs: number,
  context?: ThreatContext
): ThreatRead | 'pending' | null {
  if (row.kills.kind !== 'ready') return null;
  if (row.extras.kind === 'loading') return 'pending';
  if (
    row.extras.kind === 'ready' &&
    row.extras.lossTimesMs === null &&
    needsLossHistory(row.kills.kills, nowMs)
  ) {
    return null;
  }
  const base = threatVerdict({
    kills: row.kills.kills,
    dangerRatio: row.extras.kind === 'ready' ? row.extras.dangerRatio : null,
    killerRatio: row.extras.kind === 'ready' ? row.extras.killerRatio : null,
    lossTimesMs: row.extras.kind === 'ready' ? row.extras.lossTimesMs : null,
    nowMs,
  }).level;
  return context === undefined
    ? { level: base, base, shift: 0, reasons: [] }
    : threatInContext(base, row.kills.kills, nowMs, context);
}

export function rowThreat(
  row: PilotListRow,
  nowMs: number,
  context?: ThreatContext
): ThreatLevel | 'pending' | null {
  const read = rowThreatRead(row, nowMs, context);
  return read === null || read === 'pending' ? read : read.level;
}
