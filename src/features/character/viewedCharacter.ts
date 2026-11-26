import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

export const VIEWED_CHARACTER_PARAM = 'char';
const LEGACY_VIEWED_CHARACTER_PARAMS = ['chars'] as const;

export interface WalletOriginState {
  origin: 'wallet';
}

export function isFromWallet(state: unknown): boolean {
  return (state as Partial<WalletOriginState> | null)?.origin === 'wallet';
}

function parseId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function viewedCharacterIdFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  for (const key of [VIEWED_CHARACTER_PARAM, ...LEGACY_VIEWED_CHARACTER_PARAMS]) {
    const id = parseId(params.get(key));
    if (id !== null) return id;
  }
  return null;
}

export function useViewedCharacterId(): number | undefined {
  const { search } = useLocation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const fromUrl = useMemo(() => viewedCharacterIdFromSearch(search), [search]);
  const known = useLiveQuery(
    async () => (await db.characters.toArray()).map((c) => c.characterId),
    []
  );
  if (fromUrl === null || fromUrl === activeCharacterId) return undefined;
  if (known !== undefined && !known.includes(fromUrl)) return undefined;
  return fromUrl;
}
