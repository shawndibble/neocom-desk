/**
 * When a pilot's newest losses happened, read from the same kills-and-losses
 * list Recent kills and losses shows (`fetchPilotKillmails`), so the Threat
 * verdict needs no loss request of its own. Null when any loss comes without a
 * readable date (zKillboard sent it without its killmail body): a loss that
 * cannot be dated might be the recent one, so the losses cannot be told.
 */
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
