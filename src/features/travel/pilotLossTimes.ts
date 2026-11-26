import type { PilotKillmail } from '@/lib/zkillboard';

export function lossTimesMs(entries: readonly PilotKillmail[]): number[] | null {
  const times: number[] = [];
  for (const entry of entries) {
    if (entry.side !== 'loss') continue;
    const timeMs = entry.detail?.time == null ? NaN : Date.parse(entry.detail.time);
    if (!Number.isFinite(timeMs)) return null;
    times.push(timeMs);
  }
  return times;
}
