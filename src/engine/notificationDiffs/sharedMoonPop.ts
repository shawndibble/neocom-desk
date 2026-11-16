/**
 * `sharedMoonPop` (issue #6225; GLOSSARY.md **Shared Moon Pop**): a **Shared Pop** another
 * corporation's Corp Tax Book shares with one of the pilot's Characters reaches its **Pop Time**,
 * or the Character's lead time before it (default: at the Pop Time). A Scheduled Push, so the
 * Projection carries it to a closed app; this diff is the open app's half.
 *
 * Window-crossing: it fires when the fire time (`popAtMs - leadMs`) falls between the previous
 * poll and this one, so a pop is told once. A crossing more than `LATE_LIMIT_MS` ago is dropped:
 * a device opened hours later is not told the belt "is popping now". Which Characters see a pop
 * the poll domain has already applied to `entries`; a muted one fires nothing.
 *
 * A chunk fractured early: the laser shot moves the Pop Time back to the actual fracture, which
 * the book learns only at its next sync, hours later. That time is then already behind the last
 * poll and no window crosses it, so a pop whose time moved earlier to one already past is told
 * once as fractured early (`early`), up to `EARLY_LATE_LIMIT_MS` after the fracture: the belt
 * lasts 48 hours, and the book syncs every 6. Its Occurrence Key names the new time, so it is
 * told apart from the push for the old one, which the server cancels when it republishes.
 */
import { HOUR_MS } from '@/lib/age';

/** Which instant a Shared Pop is shown at (`functions/src/popSharing.ts`'s `PopTime`). */
export type SharedPopTime = 'ready' | 'auto-fracture';

export interface SharedMoonPopEntrySnapshot {
  /** `{corporationId}_{extractionId}`: the Shared Pop's id and its Calendar deep link. */
  popId: string;
  /** The sharing book's corporation: the one collecting the tax. */
  corporationId: number;
  refineryName: string | null;
  popTime: SharedPopTime;
  /** Epoch ms of the Pop Time. */
  popAtMs: number;
  /** The start link's rate, in percent. */
  ratePct: number;
  /** The Character's lead time, in ms, as it stood when this poll ran; 0 fires at the Pop Time. */
  leadMs: number;
  /**
   * Whether its sharing corporation was muted when this poll ran. Kept in the snapshot rather
   * than dropped, so an unmute reaches the next Projection upload without waiting for a poll.
   */
  muted?: boolean;
}

export interface SharedMoonPopSnapshot {
  entries: readonly SharedMoonPopEntrySnapshot[];
  nowMs: number;
}

export interface SharedMoonPopFire {
  eventId: 'sharedMoonPop';
  characterId: number;
  popId: string;
  corporationId: number;
  refineryName: string | null;
  popTime: SharedPopTime;
  popAtMs: number;
  ratePct: number;
  thresholdMs: number;
  /** The chunk fractured early: told after the fact, when the Pop Time moved back past now. */
  early?: true;
}

/** How late a live poll may still report a crossing. */
const LATE_LIMIT_MS = HOUR_MS;
/** How long after an early fracture it is still news: past one book sync (6 h), with margin. */
export const EARLY_LATE_LIMIT_MS = 12 * HOUR_MS;

export function sharedMoonPopFire(
  characterId: number,
  entry: SharedMoonPopEntrySnapshot
): SharedMoonPopFire {
  return {
    eventId: 'sharedMoonPop',
    characterId,
    popId: entry.popId,
    corporationId: entry.corporationId,
    refineryName: entry.refineryName,
    popTime: entry.popTime,
    popAtMs: entry.popAtMs,
    ratePct: entry.ratePct,
    thresholdMs: entry.leadMs,
  };
}

/** Fires nothing without a baseline; a first poll only seeds it. */
export function diffSharedMoonPop(
  characterId: number,
  prev: SharedMoonPopSnapshot | undefined,
  next: SharedMoonPopSnapshot
): SharedMoonPopFire[] {
  if (!prev) return [];
  const prevAt = new Map(prev.entries.map((e) => [e.popId, e.popAtMs]));
  return next.entries.flatMap((entry) => {
    if (entry.muted === true) return [];
    const was = prevAt.get(entry.popId);
    const fireAt = entry.popAtMs - entry.leadMs;
    // Moved earlier to a fire time this poll's window can no longer cross: tell it now.
    if (
      was !== undefined &&
      entry.popAtMs < was &&
      fireAt <= prev.nowMs &&
      next.nowMs - entry.popAtMs <= EARLY_LATE_LIMIT_MS
    ) {
      const fire = sharedMoonPopFire(characterId, entry);
      return [entry.popAtMs <= next.nowMs ? { ...fire, early: true as const } : fire];
    }
    const crossed =
      fireAt > prev.nowMs && fireAt <= next.nowMs && next.nowMs - fireAt <= LATE_LIMIT_MS;
    return crossed ? [sharedMoonPopFire(characterId, entry)] : [];
  });
}

/** The Calendar's deep link to one Shared Pop (agreed with issue #6224). */
export function sharedMoonPopPath(popId: string): string {
  return `/calendar?pop=${encodeURIComponent(popId)}`;
}

const KEY_PREFIX = 'sharedMoonPop:';

/**
 * The pop id inside a `sharedMoonPop` Occurrence Key (`occurrenceKey.ts`), so a Scheduled Push,
 * which carries only the key and rendered text, can still open its pop. Undefined for any other
 * event's key.
 */
export function sharedPopIdOfOccurrenceKey(key: string): string | undefined {
  if (!key.startsWith(KEY_PREFIX)) return undefined;
  const popId = key.slice(KEY_PREFIX.length).split(':')[0];
  return popId === '' ? undefined : popId;
}
