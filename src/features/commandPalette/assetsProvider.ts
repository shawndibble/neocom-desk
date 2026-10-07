/**
 * The Command Palette's Assets group: every item the pilot's Characters own,
 * one row per type, searchable by name. Selecting one opens the Assets page
 * already searching for it.
 *
 * Cache-only end to end, like the Contacts group — the asset lists are the
 * ones the Assets page (and Build Plan stock detection) already cached, and
 * names come from the SDE snapshot and the name cache. Opening the palette
 * never costs a request, and never trips the re-auth banner for an alt.
 */
import { db } from '@/db';
import { readCachedRows } from '@/esi/cache';
import type { CharacterAsset } from '@/esi/endpoints';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { KEY as ASSETS_KEY } from '@/features/character/assets';
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
  /** Summed across every holder. */
  readonly quantity: number;
  /** Every Character holding some, in the order the Characters were added. */
  readonly holders: readonly PaletteAssetHolder[];
}

export interface CharacterAssetList {
  readonly characterId: number;
  readonly name: string;
  readonly assets: readonly CharacterAsset[];
}

/**
 * Pure. Every Character's stacks, merged into one row per type. A type with
 * no known name cannot be searched for, so it is dropped.
 */
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

/**
 * The Assets page searching for `name` — across every Character unless the
 * active one is the only holder, so an alt-only item never opens an empty search.
 */
export function assetsHref(
  name: string,
  holderIds: readonly number[],
  activeCharacterId: number | null
): string {
  const params = new URLSearchParams({ q: name });
  if (holderIds.some((id) => id !== activeCharacterId)) params.set('chars', 'all');
  return `/assets?${params.toString()}`;
}

const ASSETS_SCOPES = requiredScopesForEndpoints(['getCharacterAssets']);

/**
 * The cached assets of every Character whose grant covers them. No request,
 * even for a lapsed list — a Character without the scope contributes nothing,
 * so with no grant anywhere the group never shows.
 */
export async function loadPaletteAssets(): Promise<PaletteAsset[]> {
  const [characters, tokens] = await Promise.all([db.characters.toArray(), db.tokens.toArray()]);
  const granted = new Set(
    tokens
      .filter((token) => ASSETS_SCOPES.every((scope) => token.scopes.includes(scope)))
      .map((token) => token.characterId)
  );
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
  /** Characters the group cannot read: no grant, or nothing cached yet. */
  readonly missing: readonly string[];
}

/** Cache-only, like `loadPaletteAssets`. Who the Assets group leaves out. */
export async function loadPaletteAssetsScope(): Promise<PaletteAssetsScope> {
  const [characters, tokens] = await Promise.all([db.characters.toArray(), db.tokens.toArray()]);
  const granted = new Set(
    tokens
      .filter((token) => ASSETS_SCOPES.every((scope) => token.scopes.includes(scope)))
      .map((token) => token.characterId)
  );
  const holders = characters.filter((character) => granted.has(character.characterId));
  const rows =
    holders.length === 0
      ? new Map()
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
  /** `loadPaletteAssetsScope()`'s answer; the group's readout. */
  readonly scope?: PaletteAssetsScope;
  /** `loadPaletteAssets()`'s answer, kept live while the palette is open; empty until it lands. */
  readonly assets: readonly PaletteAsset[];
  readonly activeCharacterId: number | null;
  readonly navigate: (path: string) => void;
  /** The row's sublabel: each holder's quantity. */
  readonly describe: (asset: PaletteAsset) => string;
  /** The trailing hint: the total owned. */
  readonly quantityHint: (quantity: number) => string;
}

/**
 * Synchronous over the already-loaded list, so no keystroke waits on (or
 * shows "Searching…" for) anything, and an empty list hides the group.
 */
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
    // After Characters, before Market Items.
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
