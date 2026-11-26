import { db } from '@/db';
import { characterIdsWithScopes } from '@/app/characterIdsWithScopes';
import { readCachedRows } from '@/esi/cache';
import type { CharacterAsset } from '@/esi/endpoints';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { KEY as ASSETS_KEY } from '@/features/assets/assets';
import { readCachedTypeNames } from '@/features/character/typeNames';
import { rankedSearch } from '@/lib/rankedSearch';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

export interface PaletteAssetHolder {
  readonly characterId: number;
  readonly characterName: string;
  readonly quantity: number;
}

export interface PaletteAsset {
  readonly typeId: number;
  readonly name: string;
  readonly quantity: number;
  readonly holders: readonly PaletteAssetHolder[];
}

export interface CharacterAssetList {
  readonly characterId: number;
  readonly name: string;
  readonly assets: readonly CharacterAsset[];
}

export function buildPaletteAssets(
  lists: readonly CharacterAssetList[],
  names: ReadonlyMap<number, string>
): PaletteAsset[] {
  const byType = new Map<number, Map<number, PaletteAssetHolder>>();
  for (const list of lists) {
    for (const { type_id, quantity } of list.assets) {
      if (!names.has(type_id)) continue;
      let holders = byType.get(type_id);
      if (!holders) byType.set(type_id, (holders = new Map()));
      const held = holders.get(list.characterId)?.quantity ?? 0;
      holders.set(list.characterId, {
        characterId: list.characterId,
        characterName: list.name,
        quantity: held + quantity,
      });
    }
  }
  return [...byType].map(([typeId, holders]) => {
    const all = [...holders.values()];
    return {
      typeId,
      name: names.get(typeId)!,
      quantity: all.reduce((sum, holder) => sum + holder.quantity, 0),
      holders: all,
    };
  });
}

export function assetsHref(
  name: string,
  holderIds: readonly number[],
  activeCharacterId: number | null
): string {
  const params = new URLSearchParams({ q: name });
  if (holderIds.some((id) => id !== activeCharacterId)) params.set('chars', 'all');
  return `/assets/items?${params.toString()}`;
}

const ASSETS_SCOPES = requiredScopesForEndpoints(['getCharacterAssets']);

export async function loadPaletteAssets(): Promise<PaletteAsset[]> {
  const [characters, grantedIds] = await Promise.all([
    db.characters.toArray(),
    characterIdsWithScopes(ASSETS_SCOPES),
  ]);
  const granted = new Set(grantedIds);
  const holders = characters.filter((character) => granted.has(character.characterId));
  if (holders.length === 0) return [];
  const rows = await readCachedRows<CharacterAsset[]>(
    holders.map((character) => character.characterId),
    ASSETS_KEY
  );
  const lists = holders.flatMap(({ characterId, name }) => {
    const row = rows.get(characterId);
    return row ? [{ characterId, name, assets: row.data }] : [];
  });
  const names = await readCachedTypeNames(
    lists.flatMap((list) => list.assets.map((a) => a.type_id))
  );
  return buildPaletteAssets(lists, names);
}

export interface PaletteAssetsScope {
  readonly total: number;
  readonly missing: readonly string[];
}

export async function loadPaletteAssetsScope(): Promise<PaletteAssetsScope> {
  const [characters, grantedIds] = await Promise.all([
    db.characters.toArray(),
    characterIdsWithScopes(ASSETS_SCOPES),
  ]);
  const granted = new Set(grantedIds);
  const holders = characters.filter((character) => granted.has(character.characterId));
  const rows =
    holders.length === 0
      ? new Map<number, unknown>()
      : await readCachedRows<CharacterAsset[]>(
          holders.map((character) => character.characterId),
          ASSETS_KEY
        );
  return {
    total: characters.length,
    missing: characters
      .filter(
        (character) => !granted.has(character.characterId) || !rows.has(character.characterId)
      )
      .map((character) => character.name),
  };
}

export interface AssetsProviderOptions {
  readonly scope?: PaletteAssetsScope;
  readonly assets: readonly PaletteAsset[];
  readonly activeCharacterId: number | null;
  readonly navigate: (path: string) => void;
  readonly describe: (asset: PaletteAsset) => string;
  readonly quantityHint: (quantity: number) => string;
}

export function createAssetsProvider({
  scope,
  assets,
  activeCharacterId,
  navigate,
  describe,
  quantityHint,
}: AssetsProviderOptions): PaletteProvider {
  return {
    id: 'assets',
    labelKey: 'commandPalette.groups.assets',
    order: 3,
    scope:
      scope && scope.total > 0
        ? { scope: 'all', total: scope.total, missing: scope.missing }
        : undefined,
    minQueryLength: 2,
    search: (query): PaletteResult[] =>
      rankedSearch(assets, query, { primary: (a) => a.name, limit: GROUP_LIMIT }).map((a) => ({
        id: String(a.typeId),
        label: a.name,
        sublabel: describe(a),
        hint: quantityHint(a.quantity),
        run: () =>
          navigate(
            assetsHref(
              a.name,
              a.holders.map((holder) => holder.characterId),
              activeCharacterId
            )
          ),
      })),
  };
}
