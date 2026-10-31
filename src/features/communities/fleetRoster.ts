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

export async function resolveFleetRoster(
  names: string[],
  members: { uid: string }[],
  options: { signal?: AbortSignal } = {}
): Promise<RosterRow[]> {
  const found = await postUniverseIds(names, { signal: options.signal });
  const byName = new Map(
    (found.characters ?? []).map((entry) => [entry.name.toLowerCase(), entry] as const)
  );
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
