/**
 * The active Character's corporation id, for the corp reads that key on it.
 *
 * Written by `recordCharacterCorporation` from the public-info read, so on a
 * cold start it is simply absent — and a corp read with no corporation to read
 * must wait rather than invent one.
 *
 * (This module also held `useCorpOwner`, the Personal / Corporation switch,
 * until its last page — Wallet — moved the corporation side to `/corp/wallet`.)
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * The active Character's corporation, live from Dexie.
 *
 * `undefined` (never learned) and "no active Character" both answer null: both
 * mean there is no corporation to read, which is the only distinction most
 * callers make. A page that must not flash its "nothing cached" state while
 * the Dexie read is still in flight uses `useActiveCorporationIdState`.
 */
export function useActiveCorporationId(): number | null {
  return useActiveCorporationIdState() ?? null;
}

/**
 * The same read, with the Dexie query's own "not answered yet" kept apart:
 * `undefined` while it is in flight, null once it is known there is no
 * corporation to read.
 */
export function useActiveCorporationIdState(): number | null | undefined {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  return useLiveQuery(async () => {
    if (activeCharacterId === null) return null;
    return (await db.characters.get(activeCharacterId))?.corporationId ?? null;
  }, [activeCharacterId]);
}
