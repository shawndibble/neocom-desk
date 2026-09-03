/**
 * The baseline half of the roster diff (issue #297): the member list this
 * device last saw, so the next visit can say who joined and who left.
 *
 * Built on `features/notifications/pollerState.ts` rather than on a store of
 * its own. That module already is the app's answer to "persist the previous
 * observation of a domain, per Character, device-locally, and never sync it" —
 * one `createLocalSetting` key holding a Character-id-keyed map — and a roster
 * is exactly that shape.
 *
 * A key of this page's own, though, not a shared one. A baseline records what
 * *this observer* has already reported, and #299's Member Joined / Member Left
 * events are a second observer on a ten-minute cadence: sharing one row would
 * let the background poll consume a change moments before the user opened the
 * page, so the summary would almost never appear. What the two share is the
 * pure `diffRoster` in `engine/corp/members.ts`, which is the part that must
 * not be written twice.
 *
 * Device-local on purpose, like every other poller baseline: a second device
 * showing the same joins a day later is right, because the diff answers "what
 * changed since *you* last looked", and a synced baseline would mean whichever
 * device opened the page first silently consumed the change for the others.
 *
 * The corporation id is stored *inside* the snapshot and checked on read. The
 * store's key is the reading Character, and a Character can change corporation
 * — at which point the old roster is not a stale baseline but a different
 * corporation's, whose whole membership would otherwise be reported as having
 * left. A mismatch answers "no baseline", the same reading `useCorpAccess`
 * gives a roles snapshot tagged with the wrong Character.
 */
import {
  createPollerStateStore,
  withCharacterSnapshot,
} from '@/features/notifications/pollerState';

/** One Character's last observed roster, tagged with the corporation it belonged to. */
export interface RosterSnapshot {
  /** When the observation was made — the shape every poller snapshot carries. */
  nowMs: number;
  corporationId: number;
  memberIds: number[];
}

function isRosterSnapshot(raw: unknown): raw is RosterSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const record = raw as Record<string, unknown>;
  return (
    typeof record.nowMs === 'number' &&
    typeof record.corporationId === 'number' &&
    Array.isArray(record.memberIds) &&
    record.memberIds.every((id) => typeof id === 'number')
  );
}

/** Created once at module scope, as `createLocalSetting` requires. Exported for tests. */
export const useCorpRosterState = createPollerStateStore<RosterSnapshot>(
  'corp.rosterBaseline',
  isRosterSnapshot
);

/** Hydrates the store once and hands back the current map. */
async function rosterState() {
  await useCorpRosterState.getState().hydrate();
  return useCorpRosterState.getState().value;
}

/**
 * The roster to diff against, or `undefined` when there is none for this
 * Character and corporation — a first visit, a fresh device, or a corporation
 * change. `engine/corp/members.ts` reads that `undefined` as "no baseline" and
 * reports no change at all, rather than announcing every member as a joiner.
 */
export async function readPreviousRoster(
  characterId: number,
  corporationId: number
): Promise<number[] | undefined> {
  const snapshot = (await rosterState())[characterId];
  if (snapshot === undefined || snapshot.corporationId !== corporationId) return undefined;
  return snapshot.memberIds;
}

/** Records this visit's roster as the baseline the next visit diffs against. */
export async function recordRoster(
  characterId: number,
  corporationId: number,
  memberIds: readonly number[],
  nowMs: number
): Promise<void> {
  const state = await rosterState();
  await useCorpRosterState
    .getState()
    .setValue(
      withCharacterSnapshot(state, characterId, { nowMs, corporationId, memberIds: [...memberIds] })
    );
}
