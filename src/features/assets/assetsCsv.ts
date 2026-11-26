import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CharacterAsset } from '@/esi/endpoints';
import { assetStackValue } from '@/engine/assetTree';
import { assetHolderChain, locationLabel } from './assetsLogic';

export interface AssetCsvRow {
  location: string;
  locationPath: string;
  place: string;
  system: string;
  character: string;
  name: string;
  gameName: string;
  quantity: number;
  nickname: string;
  unitPrice: number | null;
  totalValue: number | null;
  unitVolume: number | null;
  totalVolume: number | null;
  blueprint: 'BPO' | 'BPC' | null;
  locationFlag: string;
  itemId: number;
  typeId: number;
}

export interface AssetCsvGroup {
  label: string;
  entries: readonly { asset: CharacterAsset; name: string; gameName?: string }[];
}

export interface AssetCsvContext {
  assetsByItemId: Map<number, CharacterAsset>;
  typeNames: ReadonlyMap<number, string>;
  gameNames: Readonly<Record<number, string>>;
  locationNames: ReadonlyMap<number, string>;
  systemNameByLocationId: ReadonlyMap<number, string>;
  priceByTypeId: ReadonlyMap<number, number>;
  itemValueByItemId: ReadonlyMap<number, number>;
  volumeByTypeId: ReadonlyMap<number, number>;
  blueprintTypeIds: ReadonlySet<number> | null;
  placeNicknames: Readonly<Record<number, string>>;
  characterNameOf: (itemId: number) => string;
  t: CsvTranslate;
}

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
