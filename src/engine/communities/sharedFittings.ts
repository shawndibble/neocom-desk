export type SharedFittingSource = 'saved' | 'game';

export interface SharedFitting {
  communityId: string;
  id: string;
  ownerUid: string;
  source: SharedFittingSource;
  name: string;
  hull: string;
  code: string;
  updatedAt: number;
}

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

export function shareMenuMode(communityCount: number): 'none' | 'direct' | 'submenu' {
  if (communityCount <= 0) return 'none';
  return communityCount === 1 ? 'direct' : 'submenu';
}

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

export function fittingChoiceKey({ source, key }: SharedFittingKey): string {
  return `${source}-${key}`;
}

export function followsSave(
  alreadyShared: boolean,
  allExcluded: ReadonlySet<string> | null,
  key: SharedFittingKey
): boolean {
  return alreadyShared || (allExcluded !== null && !allExcluded.has(fittingChoiceKey(key)));
}
