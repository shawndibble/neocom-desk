import { useEffect, type ComponentProps } from 'react';
import { assetBlueprintKind } from '@/engine/blueprintKind';
import {
  assetStackValue,
  collectItemIds,
  collectStationItemIds,
  type AssetTreeNode,
  type AssetTreeStation,
} from '@/engine/assetTree';
import { assetNodeSegment } from '@/engine/assetPath';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { CharacterAsset } from '@/esi/endpoints';
import type { AbyssalAssetEstimates } from '@/features/abyssal/useAbyssalAssetEstimates';
import { abyssalValueHint } from '@/features/abyssal/abyssalValueHint';
import { OreItemMenu } from '@/features/assets/oreDecision/OreItemMenu';
import {
  ContainerRow,
  ItemRow,
  LocationRow,
  SearchResultRow,
  SectionHeading,
} from '@/features/assets/assetBrowserRows';
import type { Translate } from '@/lib/translate';
import { selectionStateForIds } from '@/features/assets/assetSelection';
import type { PinState } from '@/features/assets/stationPins';
import { planTargetForItem } from '@/features/industry/blueprintCatalog';
import { useItemActions } from '@/features/market/itemActions';
import {
  assetHref,
  characterBadgeFor,
  isUnresolvedParent,
  useAssetItemActions,
  type AssetMatch,
  type BrowseRow,
  type CharacterBadgeContext,
} from './assetBrowseModel';

/** Selection wiring every browse row shares. */
interface RowSelectionProps {
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelection: (ids: readonly number[]) => void;
  t: Translate;
}

/**
 * A ship, bay or container node — descends one more step. Shared by the
 * personal and corp browse; each supplies its own drill-down `href`.
 */
export function NodeContainerRow({
  node,
  href,
  label,
  characterBadge,
  selectMode,
  selectedIds,
  onToggleSelection,
  t,
}: RowSelectionProps & {
  node: Exclude<AssetTreeNode, { kind: 'item' }>;
  href: string;
  label: string;
  characterBadge: string | null;
}) {
  return (
    <ContainerRow
      href={href}
      label={label}
      itemCount={node.itemCount}
      estimatedValue={node.estimatedValue}
      characterBadge={characterBadge}
      named={node.kind !== 'bay'}
      selectMode={selectMode}
      selectionState={selectionStateForIds(collectItemIds(node), selectedIds)}
      onToggleSelection={() => onToggleSelection(collectItemIds(node))}
      t={t}
    />
  );
}

/**
 * An item leaf. The caller owns what differs — pricing, volume, badges and the
 * context-menu wrapper — and passes it in; selection wiring lives here.
 */
export function NodeItemRow({
  asset,
  label,
  unitVolume,
  estimatedValue,
  valueHint,
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
  unitVolume: number | undefined;
  estimatedValue: number;
  valueHint?: string;
  characterBadge: string | null;
  blueprintKind: ComponentProps<typeof ItemRow>['blueprintKind'];
  /** Set for a Mutated module only. */
  itemId?: number;
  wrap: ComponentProps<typeof ItemRow>['wrap'];
}) {
  return (
    <ItemRow
      name={label}
      quantity={asset.quantity}
      unitVolume={unitVolume}
      estimatedValue={estimatedValue}
      valueHint={valueHint}
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
  characterBadges: CharacterBadgeContext;
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelection: (ids: readonly number[]) => void;
  stationLabelFor: (station: AssetTreeStation) => string;
  nodeLabel: (node: AssetTreeNode) => string;
  locationNames: ReadonlyMap<number, string>;
  securityForStation: (locationId: number) => number | null | undefined;
  jumpsAwayFor: (locationId: number) => JumpsAwayResult | undefined;
  pinStateFor: (locationId: number) => PinState;
  onTogglePin: (locationId: number) => void;
  pathStationId: number | null;
  pathSegments: readonly string[];
  trailFor: (asset: CharacterAsset) => string[];
  rootStationIdFor: (asset: CharacterAsset) => number | null;
  /** The page's query string, carried onto every drill-down link. */
  query: string;
}

/** Dispatches one virtualized row to the right presentation component. */
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

/**
 * An abyssal module's row asks for its MutaMarket estimate while it is on
 * screen, and names what its value is (or why it has none). Undefined for
 * any other stack.
 */
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
    // Leaving the screen before its turn drops the ask.
    return request({ itemId, typeId });
  }, [isAbyssal, itemId, typeId, request]);
  if (!isAbyssal || itemId === undefined) return undefined;
  return abyssalValueHint(abyssal.estimates.get(itemId), t);
}

/** Split out so it can call `useAssetItemActions` — a heading/location row does not. */
function SearchMatchRow({
  match,
  t,
  characterBadges,
  securityForStation,
  trailFor,
  rootStationIdFor,
  query,
}: BrowseRowViewProps & { match: AssetMatch }) {
  const actions = useAssetItemActions();
  const { asset, name } = match;
  const valueHint = useAbyssalValueHint(asset, actions.abyssal, t);
  const rootStationId = rootStationIdFor(asset);
  return (
    <SearchResultRow
      name={name}
      quantity={asset.quantity}
      estimatedValue={assetStackValue(asset, actions.priceByTypeId, actions.itemValueByItemId)}
      trail={trailFor(asset)}
      security={rootStationId === null ? undefined : securityForStation(rootStationId)}
      href={assetHref(rootStationId, [], query)}
      characterBadge={characterBadgeFor(asset.item_id, characterBadges)}
      blueprintKind={assetBlueprintKind(asset, actions.blueprintTypeIds)}
      valueHint={valueHint}
      t={t}
    />
  );
}

/** Split out so it can call `useAssetItemActions` — a leaf needs pricing/menu wiring a heading does not. */
function NodeRowView({
  node,
  t,
  selectMode,
  selectedIds,
  onToggleSelection,
  nodeLabel,
  characterBadges,
  pathStationId,
  pathSegments,
  query,
}: BrowseRowViewProps & { node: AssetTreeNode }) {
  const actions = useAssetItemActions();
  const pageActions = useItemActions();
  const label = nodeLabel(node);
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
        characterBadge={badge}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleSelection={onToggleSelection}
        t={t}
      />
    );
  }

  const { asset } = node;
  // A Mutated module's Show info opens on its own Rolls; any other stack's on its type.
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
      unitVolume={actions.volumeByTypeId.get(asset.type_id)}
      estimatedValue={estimatedValue}
      valueHint={valueHint}
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
