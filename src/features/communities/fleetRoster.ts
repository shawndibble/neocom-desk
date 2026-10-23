/**
 * Fleet Payout roster (issue #4779): a pasted fleet list resolved through ESI
 * to canonical names and character ids, each marked Member or not. A name ESI
 * does not know stays on the list as typed (no id, no Member link).
 */
import { postUniverseIds } from '@/esi/endpoints/universe';
import { uidForCharacter } from '@/sync/uid';

export interface RosterRow {
  pilotName: string;
  characterId: number | null;
  isMember: boolean;
  notFound: boolean;
}

/** /universe/ids takes at most 500 names per call. */
const CHUNK = 500;

export async function resolveFleetRoster(
  names: string[],
  members: { uid: string }[],
  options: { signal?: AbortSignal } = {}
): Promise<RosterRow[]> {
  const byName = new Map<string, { id: number; name: string }>();
  for (let i = 0; i < names.length; i += CHUNK) {
    const found = await postUniverseIds(names.slice(i, i + CHUNK), { signal: options.signal });
    for (const entry of found.characters ?? []) byName.set(entry.name.toLowerCase(), entry);
  }
  const memberUids = new Set(members.map((member) => member.uid));
  return names.map((typed) => {
    const hit = byName.get(typed.toLowerCase());
    if (!hit) return { pilotName: typed, characterId: null, isMember: false, notFound: true };
    return {
      pilotName: hit.name,
      characterId: hit.id,
      isMember: memberUids.has(uidForCharacter(hit.id)),
      notFound: false,
    };
  });
}
