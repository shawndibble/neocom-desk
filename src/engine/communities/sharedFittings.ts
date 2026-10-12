/**
 * Shared Fittings (issue #3605): the pure half. A Member shares a saved
 * Fitting (keyed by its record id) or an In-game one (keyed by its ESI fitting
 * id) into a Community; the doc id carries the owning Character so
 * `firestore.rules` can bind a write to its writer.
 */

export type SharedFittingSource = 'saved' | 'game';

/** One shared Fitting as a Community stores it. `code` is the Fitting Share Code, never a URL. */
export interface SharedFitting {
  communityId: string;
  /** The doc id: `<ownerUid>~<source>-<key>`. */
  id: string;
  ownerUid: string;
  source: SharedFittingSource;
  name: string;
  hull: string;
  code: string;
  /** Epoch ms of the push. For an In-game Fitting it is the snapshot's time. */
  updatedAt: number;
}

/** A Fitting seen once however many Communities it is shared to. */
export interface SharedFittingRow extends SharedFitting {
  communityIds: string[];
}

export interface SharedFittingKey {
  source: SharedFittingSource;
  key: string;
}

export function sharedFittingId(ownerUid: string, { source, key }: SharedFittingKey): string {
  return `${ownerUid}~${source}-${key}`;
}

/** How the library remembers "I already shared this to that Community". */
export function shareMarker(communityId: string, { source, key }: SharedFittingKey): string {
  return `${communityId}|${source}-${key}`;
}

export function parseSharedFittingId(id: string): (SharedFittingKey & { ownerUid: string }) | null {
  const parts = id.split('~');
  if (parts.length !== 2) return null;
  const match = /^(saved|game)-(.+)$/.exec(parts[1]);
  if (!match) return null;
  return { ownerUid: parts[0], source: match[1] as SharedFittingSource, key: match[2] };
}

/** What a Fitting's "Share to Community" item is: absent, straight to the one Community, or a submenu. */
export function shareMenuMode(communityCount: number): 'none' | 'direct' | 'submenu' {
  if (communityCount <= 0) return 'none';
  return communityCount === 1 ? 'direct' : 'submenu';
}

/**
 * The rows the Fittings library lists: not the viewer's own (their saved ones
 * are already there), and one row per Fitting however many Communities hold a
 * copy — the newest copy, naming each Community.
 */
export function dedupeSharedFittings(
  fittings: readonly SharedFitting[],
  viewerUid: string
): SharedFittingRow[] {
  const byId = new Map<string, SharedFittingRow>();
  for (const fitting of fittings) {
    if (fitting.ownerUid === viewerUid) continue;
    const seen = byId.get(fitting.id);
    if (!seen) {
      byId.set(fitting.id, { ...fitting, communityIds: [fitting.communityId] });
      continue;
    }
    const newer = fitting.updatedAt > seen.updatedAt ? fitting : seen;
    byId.set(fitting.id, {
      ...newer,
      communityIds: [...seen.communityIds, fitting.communityId],
    });
  }
  return [...byId.values()];
}

/** A Fitting's key in a share choice: its doc id without the owner, the same in every Community. */
export function fittingChoiceKey({ source, key }: SharedFittingKey): string {
  return `${source}-${key}`;
}

/**
 * Whether a saved Fitting's re-save is pushed to one Community: it already
 * holds the Fitting, or "share all" is on there (`allExcluded` is the
 * Fittings stopped since, null when off) and this one was not stopped.
 */
export function followsSave(
  alreadyShared: boolean,
  allExcluded: ReadonlySet<string> | null,
  key: SharedFittingKey
): boolean {
  return alreadyShared || (allExcluded !== null && !allExcluded.has(fittingChoiceKey(key)));
}
