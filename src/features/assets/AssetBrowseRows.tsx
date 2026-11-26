import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MenuItem } from '@/components/ui';
import { assetShipEditLocation } from '@/features/fittings/assetShipLocation';
import { useOpenInFittings } from '@/features/fittings/useOpenInFittings';
import { assetBlueprintKind } from '@/engine/blueprintKind';
import {
  assetStackValue,
  collectItemIds,
  collectStationItemIds,
  type AssetTreeNode,
  type AssetTreeStation,
} from '@/engine/assetTree';
import { assetNodeSegment, type FoundAssetNode } from '@/engine/assetPath';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { CharacterAsset } from '@/esi/endpoints';
import type { AbyssalAssetEstimates } from '@/features/abyssal/useAbyssalAssetEstimates';
import { abyssalValueHint } from '@/features/abyssal/abyssalValueHint';
import { OreItemMenu } from '@/features/assets/oreDecision/OreItemMenu';
import { askEstimateFigure, type AskEstimateFigure } from '@/features/assets/assetAskFigure';
import {
  ContainerRow,
  ItemRow,
  LocationRow,
  SearchResultRow,
  SectionHeading,
} from '@/features/assets/assetBrowserRows';
import type { Translate } from '@/lib/translate';
import type { PlaceNicknamesValue } from '@/features/assets/placeNicknames';
import type { AssetNameMap } from '@/engine/assetNames';
import { selectionStateForIds } from '@/features/assets/assetSelection';
import type { PinState } from '@/features/assets/stationPins';
import { planTargetForItem } from '@/features/industry/blueprintCatalog';
import { useItemActions } from '@/features/market/itemActions';
import { TurnInDetail, TurnInGlyph } from '@/features/campaigns/TurnInDetail';
import { approxIsk } from '@/features/campaigns/turnInContent';
import { turnInReward } from '@/engine/market/turnIn';
import { formatCount } from '@/lib/formatCount';
import {
  assetHref,
  characterBadgeFor,
  isUnresolvedParent,
  queryLeavingSearch,
  useAssetItemActions,
  type AssetMatch,
  type BrowseRow,
  type CharacterBadgeContext,
} from './assetBrowseModel';

interface RowSelectionProps {
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelection: (ids: readonly number[]) => void;
  t: Translate;
}

export function NodeContainerRow({
  node,
  href,
  label,
  gameName,
  characterBadge,
  stationId,
  extraItems,
  selectMode,
  selectedIds,
  onToggleSelection,
  t,
}: RowSelectionProps & {
  node: Exclude<AssetTreeNode, { kind: 'item' }>;
  href: string;
  label: string;
  gameName?: string;
  characterBadge: string | null;
  stationId: number | null;
  extraItems?: ReactNode;
}) {
  return (
    <ContainerRow
      href={href}
      label={label}
      gameName={gameName}
      typeId={node.kind === 'bay' ? undefined : node.asset.type_id}
      itemCount={node.itemCount}
      estimatedValue={node.estimatedValue}
      characterBadge={characterBadge}
      stationId={stationId}
      extraItems={extraItems}
      named={node.kind !== 'bay'}
      selectMode={selectMode}
      selectionState={selectionStateForIds(collectItemIds(node), selectedIds)}
      onToggleSelection={() => onToggleSelection(collectItemIds(node))}
      t={t}
    />
  );
}

export function NodeItemRow({
  asset,
  label,
  gameName,
  unitVolume,
  estimatedValue,
  valueHint,
  afterValue,
  askEstimate,
  stockUnitCost,
  showStockCost,
  characterBadge,
  blueprintKind,
  itemId,
  wrap,
  selectMode,
  selectedIds,
  onToggleSelection,
  t,
}: RowSelectionProps & {
  asset: Pick<CharacterAsset, 'item_id' | 'type_id' | 'quantity'>;
  label: string;
  gameName?: string;
  unitVolume: number | undefined;
  estimatedValue: number;
  valueHint?: string;
  afterValue?: ReactNode;
  askEstimate?: AskEstimateFigure;
  stockUnitCost: ComponentProps<typeof ItemRow>['stockUnitCost'];
  showStockCost: boolean;
  characterBadge: string | null;
  blueprintKind: ComponentProps<typeof ItemRow>['blueprintKind'];
  itemId?: number;
  wrap: ComponentProps<typeof ItemRow>['wrap'];
}) {
  return (
    <ItemRow
      name={label}
      gameName={gameName}
      quantity={asset.quantity}
      unitVolume={unitVolume}
      estimatedValue={estimatedValue}
      valueHint={valueHint}
      afterValue={afterValue}
      askEstimate={askEstimate}
      stockUnitCost={stockUnitCost}
      showStockCost={showStockCost}
      characterBadge={characterBadge}
      blueprintKind={blueprintKind}
      typeId={asset.type_id}
      itemId={itemId}
      selectMode={selectMode}
      selectionState={selectedIds.has(asset.item_id) ? 'checked' : 'unchecked'}
      onToggleSelection={() => onToggleSelection([asset.item_id])}
      t={t}
      wrap={wrap}
    />
  );
}

interface BrowseRowViewProps {
  row: BrowseRow;
  t: Translate;
  typeNames: ReadonlyMap<number, string>;
  assetNames: AssetNameMap;
  characterBadges: CharacterBadgeContext;
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelection: (ids: readonly number[]) => void;
  stationLabelFor: (station: AssetTreeStation) => string;
  placeNicknames: PlaceNicknamesValue;
  nodeLabel: (node: AssetTreeNode) => string;
  locationNames: ReadonlyMap<number, string>;
  securityForStation: (locationId: number) => number | null | undefined;
  jumpsAwayFor: (locationId: number) => JumpsAwayResult | undefined;
  pinStateFor: (locationId: number) => PinState;
  onTogglePin: (locationId: number) => void;
  pathStationId: number | null;
  pathSegments: readonly string[];
  trailFor: (asset: CharacterAsset) => string[];
  nodePathFor: (asset: CharacterAsset) => FoundAssetNode | null;
  rootStationIdFor: (asset: CharacterAsset) => number | null;
  query: string;
}

export function BrowseRowView(props: BrowseRowViewProps) {
  const { row, t } = props;

  if (row.kind === 'heading') {
    return <SectionHeading tone={row.tone}>{row.label}</SectionHeading>;
  }

  if (row.kind === 'location') {
    const { station } = row;
    const orphan = isUnresolvedParent(station, props.locationNames);
    return (
      <LocationRow
        href={assetHref(station.locationId, [], props.query)}
        label={props.stationLabelFor(station)}
        locationId={station.locationId}
        nickname={props.placeNicknames[station.locationId]}
        security={orphan ? undefined : props.securityForStation(station.locationId)}
        jumpsAway={orphan ? undefined : props.jumpsAwayFor(station.locationId)}
        itemCount={station.itemCount}
        estimatedValue={station.estimatedValue}
        pinState={props.pinStateFor(station.locationId)}
        onTogglePin={() => props.onTogglePin(station.locationId)}
        unresolvedParent={orphan}
        selectMode={props.selectMode}
        selectionState={selectionStateForIds(collectStationItemIds(station), props.selectedIds)}
        onToggleSelection={() => props.onToggleSelection(collectStationItemIds(station))}
        t={t}
      />
    );
  }

  if (row.kind === 'node') {
    return <NodeRowView {...props} node={row.node} />;
  }

  return <SearchMatchRow {...props} match={row.match} />;
}

function useAbyssalValueHint(
  asset: Pick<CharacterAsset, 'item_id' | 'type_id'> | null,
  abyssal: AbyssalAssetEstimates,
  t: Translate
): string | undefined {
  const isAbyssal = asset !== null && (abyssal.isAbyssalType?.(asset.type_id) ?? false);
  const itemId = asset?.item_id;
  const typeId = asset?.type_id;
  const { request } = abyssal;
  useEffect(() => {
    if (!isAbyssal || itemId === undefined || typeId === undefined) return undefined;
    return request({ itemId, typeId });
  }, [isAbyssal, itemId, typeId, request]);
  if (!isAbyssal || itemId === undefined) return undefined;
  return abyssalValueHint(abyssal.estimates.get(itemId), t);
}

function StackTurnIn({
  asset,
  label,
  characterBadges,
  t,
}: {
  asset: Pick<CharacterAsset, 'item_id' | 'type_id' | 'quantity'>;
  label: string;
  characterBadges: CharacterBadgeContext;
  t: Translate;
}) {
  const actions = useAssetItemActions();
  const offer = actions.turnInOfferFor(asset.type_id);
  if (!offer) return null;
  const ownerId =
    characterBadges.idByItemId.get(asset.item_id) ?? characterBadges.activeCharacterId;
  return (
    <TurnInDetail
      name={label}
      offer={offer}
      characterId={ownerId}
      characterName={ownerId === null ? undefined : characterBadges.nameById.get(ownerId)}
      surfaceLine={t('campaigns.turnIn.youHold', {
        quantity: formatCount(asset.quantity),
        amount: approxIsk(turnInReward(offer, asset.quantity).total),
      })}
      trigger={<TurnInGlyph name={label} />}
    />
  );
}

function SearchMatchRow({
  match,
  t,
  characterBadges,
  securityForStation,
  trailFor,
  nodePathFor,
  rootStationIdFor,
  placeNicknames,
  query,
}: BrowseRowViewProps & { match: AssetMatch }) {
  const actions = useAssetItemActions();
  const openInFittings = useOpenInFittings();
  const navigate = useNavigate();
  const { asset, name } = match;
  const valueHint = useAbyssalValueHint(asset, actions.abyssal, t);
  const searchValue = assetStackValue(asset, actions.priceByTypeId, actions.itemValueByItemId);
  const rootStationId = rootStationIdFor(asset);
  const trail = trailFor(asset);
  const stationNickname = rootStationId === null ? undefined : placeNicknames[rootStationId];
  if (stationNickname !== undefined && trail.length > 0) trail[0] = stationNickname;
  const nextQuery = queryLeavingSearch(query);
  const stationHref = assetHref(rootStationId, [], nextQuery);
  const found = nodePathFor(asset);
  const opensInside = found !== null && found.node.kind !== 'item';
  const href =
    found === null
      ? stationHref
      : assetHref(found.stationId, opensInside ? found.segments : found.parentSegments, nextQuery);
  const locationHref =
    found === null ? null : assetHref(found.stationId, found.parentSegments, nextQuery);
  const places = [
    { key: 'location', href: locationHref },
    { key: 'station', href: stationHref },
  ].filter(
    (place, index, all): place is { key: string; href: string } =>
      place.href !== null &&
      place.href !== href &&
      all.findIndex((other) => other.href === place.href) === index
  );
  const ship = found?.node.kind === 'ship' ? found.node : null;
  const itemId = actions.abyssal.isAbyssalType?.(asset.type_id) ? asset.item_id : undefined;
  return (
    <SearchResultRow
      name={name}
      gameName={match.gameName}
      quantity={asset.quantity}
      estimatedValue={searchValue}
      askEstimate={askEstimateFigure(asset, actions.askEstimateByTypeId, searchValue, t)}
      trail={trail}
      security={rootStationId === null ? undefined : securityForStation(rootStationId)}
      href={href}
      characterBadge={characterBadgeFor(asset.item_id, characterBadges)}
      blueprintKind={assetBlueprintKind(asset, actions.blueprintTypeIds)}
      valueHint={valueHint}
      afterLink={<StackTurnIn asset={asset} label={name} characterBadges={characterBadges} t={t} />}
      wrap={(children) => (
        <OreItemMenu
          quantity={asset.quantity}
          typeId={asset.type_id}
          itemId={itemId}
          itemName={name}
          openHref={href}
          extraItems={
            <>
              {places.map((place) => (
                <MenuItem key={place.key} onSelect={() => void navigate(place.href)}>
                  {t(`assets.search.menu.open_${place.key}`)}
                </MenuItem>
              ))}
              {ship && (
                <MenuItem
                  aria-disabled={openInFittings.pending || undefined}
                  onSelect={() => {
                    if (!openInFittings.pending)
                      openInFittings.open(() => assetShipEditLocation(ship, name));
                  }}
                >
                  {t('assets.openInFittings')}
                </MenuItem>
              )}
            </>
          }
        >
          {children}
        </OreItemMenu>
      )}
      t={t}
    />
  );
}

function NodeRowView({
  node,
  t,
  selectMode,
  selectedIds,
  onToggleSelection,
  nodeLabel,
  characterBadges,
  assetNames,
  pathStationId,
  pathSegments,
  query,
}: BrowseRowViewProps & { node: AssetTreeNode }) {
  const actions = useAssetItemActions();
  const pageActions = useItemActions();
  const openInFittings = useOpenInFittings();
  const label = nodeLabel(node);
  const gameName = node.kind === 'bay' ? undefined : assetNames[node.asset.item_id];
  const badge = node.kind === 'bay' ? null : characterBadgeFor(node.asset.item_id, characterBadges);

  const valueHint = useAbyssalValueHint(
    node.kind === 'item' ? node.asset : null,
    actions.abyssal,
    t
  );
  if (node.kind !== 'item') {
    return (
      <NodeContainerRow
        node={node}
        href={assetHref(pathStationId, [...pathSegments, assetNodeSegment(node)], query)}
        label={label}
        gameName={gameName}
        characterBadge={badge}
        stationId={pathStationId}
        extraItems={
          node.kind === 'ship' ? (
            <MenuItem
              aria-disabled={openInFittings.pending || undefined}
              onSelect={() => {
                if (!openInFittings.pending)
                  openInFittings.open(() => assetShipEditLocation(node, label));
              }}
            >
              {t('assets.openInFittings')}
            </MenuItem>
          ) : undefined
        }
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleSelection={onToggleSelection}
        t={t}
      />
    );
  }

  const { asset } = node;
  const itemId = actions.abyssal.isAbyssalType?.(asset.type_id) ? asset.item_id : undefined;
  const estimatedValue = assetStackValue(asset, actions.priceByTypeId, actions.itemValueByItemId);
  const planTarget =
    pageActions.blueprints === null
      ? undefined
      : planTargetForItem(pageActions.blueprints, asset.type_id);
  const blueprintTypeID =
    planTarget === undefined ? undefined : (planTarget?.blueprintTypeID ?? null);
  const onViewInIndustryAsMaterial = actions.materialPlanMap?.has(asset.type_id)
    ? () => actions.onViewInIndustryAsMaterial(asset.type_id)
    : undefined;

  return (
    <NodeItemRow
      asset={asset}
      label={label}
      gameName={gameName}
      unitVolume={actions.volumeByTypeId.get(asset.type_id)}
      estimatedValue={estimatedValue}
      valueHint={valueHint}
      afterValue={
        <StackTurnIn asset={asset} label={label} characterBadges={characterBadges} t={t} />
      }
      askEstimate={askEstimateFigure(asset, actions.askEstimateByTypeId, estimatedValue, t)}
      stockUnitCost={actions.stockCostByTypeId?.get(asset.type_id)?.unitCost}
      showStockCost={actions.stockCostByTypeId !== null}
      characterBadge={badge}
      blueprintKind={assetBlueprintKind(asset, actions.blueprintTypeIds)}
      itemId={itemId}
      selectMode={selectMode}
      selectedIds={selectedIds}
      onToggleSelection={onToggleSelection}
      t={t}
      wrap={(children) => (
        <OreItemMenu
          quantity={asset.quantity}
          typeId={asset.type_id}
          itemId={itemId}
          itemName={label}
          blueprintTypeID={blueprintTypeID}
          planProductTypeID={planTarget?.productTypeID}
          onViewInIndustryAsMaterial={onViewInIndustryAsMaterial}
        >
          {children}
        </OreItemMenu>
      )}
    />
  );
}
