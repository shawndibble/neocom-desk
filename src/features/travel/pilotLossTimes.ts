/**
 * When a pilot's newest losses happened, read from the same kills-and-losses
 * list Recent kills and losses shows (`fetchPilotKillmails`), so the Threat
 * verdict needs no loss request of its own. An entry zKillboard sent without
 * its killmail body has no date and is left out.
 */
import type { PilotKillmail } from '@/lib/zkillboard';

export function lossTimesMs(entries: readonly PilotKillmail[]): number[] {
  return entries.flatMap((entry) => {
    if (entry.side !== 'loss' || entry.detail?.time == null) return [];
    const timeMs = Date.parse(entry.detail.time);
    return Number.isFinite(timeMs) ? [timeMs] : [];
  });
}
