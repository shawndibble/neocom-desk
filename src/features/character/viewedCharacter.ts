/**
 * Opening Assets, Wallet Journal or Open orders for a chosen Character without
 * changing the active one (issue #2936). The Character rides in the URL as
 * `?char=<id>` (Wallet's existing key); Assets' `?chars=` keeps
 * working as an alias, but only when they carry one Character id — their
 * `current`/`all` keywords stay the Character *filter* (`characterFilterParam`).
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

export const VIEWED_CHARACTER_PARAM = 'char';
const LEGACY_VIEWED_CHARACTER_PARAMS = ['chars'] as const;

/** Route state a surface passes when drilling in from the Wallet chart, so the target can offer a way back. */
export interface WalletOriginState {
  origin: 'wallet';
}
export const WALLET_ORIGIN_STATE: WalletOriginState = { origin: 'wallet' };

export function isFromWallet(state: unknown): boolean {
  return (state as Partial<WalletOriginState> | null)?.origin === 'wallet';
}

function parseId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The Character a URL names, or null. The canonical key wins over the aliases. */
export function viewedCharacterIdFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  for (const key of [VIEWED_CHARACTER_PARAM, ...LEGACY_VIEWED_CHARACTER_PARAMS]) {
    const id = parseId(params.get(key));
    if (id !== null) return id;
  }
  return null;
}

/** `path` with `?char=<id>` — the link a drill-in from another Character's row builds. */
export function viewedCharacterHref(path: string, characterId: number): string {
  return `${path}?${VIEWED_CHARACTER_PARAM}=${characterId}`;
}

/**
 * The Character the URL asks this page to show, when that is not the active
 * one; `undefined` otherwise (no param, the active Character itself, or an id
 * that is not one of this account's Characters). Never touches the active
 * Character store. While the Character list is still loading the id is
 * trusted, so the page does not flash the active Character's data first.
 */
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
