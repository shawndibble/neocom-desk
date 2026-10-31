import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CharacterAsset } from '@/esi/endpoints';
import { assetStackValue } from '@/engine/assetTree';
import { assetHolderChain, locationLabel } from './assetsLogic';

/** One row per matched asset, with everything the Assets page shows or tips about it. */
export interface AssetCsvRow {
  /** The immediate parent's label: the station, or the container or ship the item sits in. */
  location: string;
  /** The whole way down: station or structure, then each container or ship, outermost first. */
  locationPath: string;
  /** The station or structure the item is in somewhere; blank for an item in space. */
  place: string;
  /** The solar system, when it could be read. */
  system: string;
  /** The Character who owns the item: the page lists other Characters' assets while a search runs. */
  character: string;
  name: string;
  /** The in-game name the player gave this ship or container; blank when it has none. */
  gameName: string;
  quantity: number;
  /** The Place Nickname for the root station or structure; empty where none is set. */
  nickname: string;
  /** ISK per unit; null when no price is known (a blueprint copy has its own value). */
  unitPrice: number | null;
  /** The stack's estimated value, the figure the page totals. */
  totalValue: number | null;
  unitVolume: number | null;
  totalVolume: number | null;
  blueprint: 'BPO' | 'BPC' | null;
  /** ESI's `location_flag`: the hangar, bay or slot the item sits in. */
  locationFlag: string;
  itemId: number;
  typeId: number;
}

export interface AssetCsvGroup {
  label: string;
  entries: readonly { asset: CharacterAsset; name: string; gameName?: string }[];
}

/** What a row is read against: the page's own lookups, so the file says what the page says. */
export interface AssetCsvContext {
  assetsByItemId: Map<number, CharacterAsset>;
  typeNames: ReadonlyMap<number, string>;
  /** In-game names of ships and containers, by item id. */
  gameNames: Readonly<Record<number, string>>;
  locationNames: ReadonlyMap<number, string>;
  /** System name by station or structure id. */
  systemNameByLocationId: ReadonlyMap<number, string>;
  priceByTypeId: ReadonlyMap<number, number>;
  /** A blueprint copy's or abyssal module's own value, by item id. */
  itemValueByItemId: ReadonlyMap<number, number>;
  volumeByTypeId: ReadonlyMap<number, number>;
  /** Null until the blueprint type list is read. */
  blueprintTypeIds: ReadonlySet<number> | null;
  /** Place Nicknames by station or structure id. */
  placeNicknames: Readonly<Record<number, string>>;
  /** The owning Character's name, by item id. */
  characterNameOf: (itemId: number) => string;
  t: CsvTranslate;
}

/**
 * Flattens the Assets page's location groups into export rows, preserving
 * group order (already sorted by label) and within-group order (already
 * sorted by name) — the same order the page renders. Callers should build
 * these from the full matched set, not the render-capped subset: the render
 * cap is a UI performance guard, not a data limit, and export must not
 * silently drop rows the page merely chose not to paint.
 */
export function assetCsvRows(
  groups: readonly AssetCsvGroup[],
  ctx: AssetCsvContext
): AssetCsvRow[] {
  const { t, typeNames, gameNames, assetsByItemId } = ctx;
  const holderName = (asset: CharacterAsset) =>
    gameNames[asset.item_id] ??
    typeNames.get(asset.type_id) ??
    t('common.unknownType', { id: asset.type_id });
  return groups.flatMap((group) =>
    group.entries.map(({ asset, name, gameName }) => {
      const { chain, rootLocationId, rootLocationType } = assetHolderChain(asset, assetsByItemId);
      const inSpace = rootLocationType === 'solar_system';
      const rootLabel = locationLabel(
        rootLocationId,
        // A parent ESI never returned as an asset is a structure the list has no row for.
        rootLocationType === 'item' ? 'other' : rootLocationType,
        ctx.locationNames,
        assetsByItemId,
        typeNames,
        t
      );
      const priced =
        ctx.itemValueByItemId.has(asset.item_id) ||
        (!asset.is_blueprint_copy && ctx.priceByTypeId.has(asset.type_id));
      const totalValue = priced
        ? assetStackValue(asset, ctx.priceByTypeId, ctx.itemValueByItemId)
        : null;
      const unitVolume = ctx.volumeByTypeId.get(asset.type_id) ?? null;
      return {
        location: group.label,
        locationPath: [rootLabel, ...chain.map(holderName)].join(' › '),
        place: inSpace ? '' : rootLabel,
        system: inSpace
          ? (ctx.locationNames.get(rootLocationId) ?? '')
          : (ctx.systemNameByLocationId.get(rootLocationId) ?? ''),
        character: ctx.characterNameOf(asset.item_id),
        name,
        gameName: gameName ?? '',
        quantity: asset.quantity,
        nickname: ctx.placeNicknames[rootLocationId] ?? '',
        unitPrice: totalValue === null || asset.quantity <= 0 ? null : totalValue / asset.quantity,
        totalValue,
        unitVolume,
        totalVolume: unitVolume === null ? null : unitVolume * asset.quantity,
        blueprint: asset.is_blueprint_copy
          ? 'BPC'
          : ctx.blueprintTypeIds?.has(asset.type_id)
            ? 'BPO'
            : null,
        locationFlag: asset.location_flag,
        itemId: asset.item_id,
        typeId: asset.type_id,
      };
    })
  );
}

export function assetsCsvColumns(t: CsvTranslate): CsvColumn<AssetCsvRow>[] {
  return [
    { header: t('assets.csvLocation'), value: (row) => row.location },
    { header: t('assets.csvLocationPath'), value: (row) => row.locationPath },
    { header: t('assets.csvPlace'), value: (row) => row.place },
    { header: t('assets.csvSystem'), value: (row) => row.system },
    { header: t('assets.csvCharacter'), value: (row) => row.character },
    { header: t('assets.csvItem'), value: (row) => row.name },
    { header: t('assets.csvGameName'), value: (row) => row.gameName },
    { header: t('assets.csvQuantity'), value: (row) => row.quantity },
    { header: t('assets.csvNickname'), value: (row) => row.nickname },
    { header: t('assets.csvUnitPrice'), value: (row) => row.unitPrice },
    { header: t('assets.csvTotalValue'), value: (row) => row.totalValue },
    { header: t('assets.csvUnitVolume'), value: (row) => row.unitVolume },
    { header: t('assets.csvTotalVolume'), value: (row) => row.totalVolume },
    {
      header: t('assets.csvBlueprint'),
      value: (row) => (row.blueprint === null ? null : t(`assets.csvBlueprint${row.blueprint}`)),
    },
    { header: t('assets.csvLocationFlag'), value: (row) => row.locationFlag },
    { header: t('assets.csvItemId'), value: (row) => row.itemId },
    { header: t('assets.csvTypeId'), value: (row) => row.typeId },
  ];
}
