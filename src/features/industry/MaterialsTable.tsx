import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  DataTable,
  EditableValue,
  IconButton,
  IskAmount,
  MenuItem,
  NativeSelect,
  Toast,
  textActionClassName,
} from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type { MaterialSourcing, MaterialSourcingMap } from '@/engine/industry/types';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import { cx } from '@/lib/cx';
import { formatIskCompact, maskIsk, roundIsk } from '@/lib/isk';
import { unmaskCount, unmaskNumber } from '@/lib/numberMask';
import { ItemInfoLink } from '@/features/entities';
import type { ItemMenuFor } from '@/features/market/ItemContextMenu';
import { buildMaterialsColumns } from './MaterialsColumns';
import { NotApplicable } from './NotApplicable';
import { whenFocusLeaves } from './focusLeaves';
import {
  buildSavings,
  isBuilt,
  materialPriceTag,
  materialRowState,
  shownDepth,
} from './materialRow';
import { DepthPriceLine } from './DepthPriceLine';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import {
  clearEveryOwned,
  offerableStock,
  ownedStockOffer,
  takeEveryOffer,
  undoOwnedStockChanges,
  type OwnedStockChange,
} from '@/engine/industry/ownedStockOffer';
import type { GroupStockClaims } from '@/engine/industry/groupStockClaims';
import { OwnedStockHint } from './OwnedStockHint';
import type { OwnedStockDetection } from './ownedStockDetection';
import { buildRecipe, jobsOfRuns, type MaterialTableRow } from './subBuildPlan';
import { SkillGateMarker } from './SkillGateMarker';
import { MATERIAL_ERRANDS, errandSubtotal, type MaterialErrand } from './materialErrands';
import {
  INITIAL_EDIT_SESSION,
  editSessionGroups,
  shownSections,
  reduceEditSession,
  type SessionToastMessage,
} from './materialsEditSession';
import { useIsPhone } from '@/lib/useIsPhone';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { ownedStockBulkText } from './ownedStockBulkText';
import { SourcingInput } from './SourcingInput';
import { MaterialsPhoneRow } from './MaterialsPhoneRow';
import { MakeOrBuyMarker } from './MakeOrBuyMarker';
import { SwapButton } from './SwapButton';
import { ERRAND_GLYPH, ERRAND_LABEL_KEY, ERRAND_TONE, linkClassName } from './materialsTableStyle';
import { formatCount } from '@/lib/formatCount';
import { TableScroll } from '@/components/ui/TableScroll';

interface MaterialsTableProps {
  materials: readonly MaterialTableRow[];
  nameFor: (typeID: number) => string;
  volumeFor: (typeID: number) => number | null;
  sourcing: MaterialSourcingMap | undefined;
  pricesReady: boolean;
  depthFor?: (typeID: number) => DepthPrice | undefined;
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
  onOwnedStockChange?: (changes: readonly OwnedStockChange[]) => void;
  ref?: Ref<MaterialsTableHandle>;
  detection?: OwnedStockDetection;
  groupClaimsFor?: (typeID: number) => GroupStockClaims | null;
  makeOrBuy?: ReadonlyMap<number, MakeOrBuy>;
  canBuildHere?: (typeID: number) => boolean;
  onToggleBuildHere?: (typeID: number) => void;
  onBuildAll?: (typeIDs: readonly number[]) => void;
  onBuyOre?: () => void;
  ownedSellNet?: number | null;
  sellValueFor?: (typeID: number) => number | undefined;
  onShowRecipe?: (typeID: number) => void;
  onOpenAcquisitionPicker?: (typeID: number) => void;
  skillGates?: ReadonlyMap<number, SkillGateVerdict>;
  characterNameFor?: (characterId: number) => string;
  exportProps?: UseTableExport<MaterialTableRow>['tableProps'];
  itemMenuFor?: ItemMenuFor;
  itemActionsFor?: (typeId: number, bordered?: boolean, extraItems?: ReactNode) => ReactElement;
  onShowUsedBy?: (typeID: number) => void;
}

export interface MaterialsTableHandle {
  fillAll: () => void;
  clearAll: () => void;
}

const parsePrice = unmaskNumber;

const BESIDE_COSTS_QUERY = '(min-width: 78.125rem) and (max-width: 95.999rem)';

type PhoneSort = 'plan' | 'total' | 'toBuy' | 'name';
const PHONE_SORTS: readonly PhoneSort[] = ['plan', 'total', 'toBuy', 'name'];

export function MaterialsTable({
  materials,
  nameFor,
  volumeFor,
  sourcing,
  pricesReady,
  onSourcingChange,
  onOwnedStockChange,
  ref,
  detection,
  groupClaimsFor,
  makeOrBuy,
  canBuildHere,
  onToggleBuildHere,
  onBuildAll,
  onBuyOre,
  ownedSellNet,
  sellValueFor,
  onShowRecipe,
  onOpenAcquisitionPicker,
  onShowUsedBy,
  skillGates,
  characterNameFor,
  exportProps,
  itemMenuFor,
  itemActionsFor,
  depthFor,
}: MaterialsTableProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const besideCosts = useMediaQuery(BESIDE_COSTS_QUERY);
  const idPrefix = useId();

  const [session, dispatch] = useReducer(reduceEditSession, INITIAL_EDIT_SESSION);
  const [haveOpen, setHaveOpen] = useState(false);
  const [phoneSort, setPhoneSort] = useState<PhoneSort>('plan');
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [editingHave, setEditingHave] = useState<number | null>(null);
  const [editSeed, setEditSeed] = useState<string | undefined>(undefined);
  function editHave(typeID: number | null, seed?: string) {
    setEditSeed(seed);
    setEditingHave(typeID);
  }
  function editPrice(typeID: number | null, seed?: string) {
    setEditSeed(seed);
    setEditingPrice(typeID);
  }
  const [refocus, setRefocus] = useState<string | null>(null);
  const usedByItem = useCallback(
    (material: MaterialTableRow) =>
      onShowUsedBy && !isBuilt(material) && material.acquisitionTier === undefined ? (
        <MenuItem onSelect={() => onShowUsedBy(material.typeID)}>
          {t('industry.usedBy.menuItem')}
        </MenuItem>
      ) : undefined,
    [onShowUsedBy, t]
  );
  const rowContextMenu = useMemo(
    () =>
      itemMenuFor
        ? (material: MaterialTableRow, tr: ReactElement) =>
            itemMenuFor(material.typeID, tr, usedByItem(material))
        : undefined,
    [itemMenuFor, usedByItem]
  );
  const clearRefocus = useCallback(() => setRefocus(null), []);
  const settleHave = (typeID: number) => () => {
    editHave(null);
    setRefocus(`have-${typeID}`);
  };
  const settlePrice = (typeID: number) => () => {
    editPrice(null);
    setRefocus(`price-${typeID}`);
  };
  const containerRef = useRef<HTMLDivElement>(null);

  const { held } = session;
  const groups = useMemo(() => editSessionGroups(held, materials), [held, materials]);
  const shown = useMemo(() => shownSections(groups), [groups]);
  const ownedFor = useCallback((typeID: number) => sourcing?.[typeID]?.ownedQuantity, [sourcing]);
  const offerQuantityFor = (typeID: number) =>
    offerableStock(typeID, groupClaimsFor, detection?.scopedQuantityFor);

  function writeOwned(changes: readonly OwnedStockChange[]) {
    if (onOwnedStockChange) onOwnedStockChange(changes);
    else for (const { typeID, to } of changes) onSourcingChange(typeID, { ownedQuantity: to });
  }

  useEffect(() => {
    dispatch({ type: 'rendered', shown, ownedFor });
  }, [shown, ownedFor]);

  const toast = session.toast;

  useEffect(() => {
    const target = session.focusAfterToggle;
    if (!target) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-swap-for="${target.typeID}"][data-swap-kind="${target.kind}"]`
    );
    if (el) {
      dispatch({ type: 'focusSettled' });
      el.focus();
    } else if (shown.get(target.typeID) !== target.from) {
      dispatch({ type: 'focusSettled' });
    }
  });

  function applyBulk(kind: 'all' | 'none', changes: readonly OwnedStockChange[]) {
    if (changes.length > 0) writeOwned(changes);
    dispatch({ type: 'bulkApplied', kind, changes });
  }

  useImperativeHandle(ref, () => ({
    fillAll: () => applyBulk('all', takeEveryOffer(materials, ownedFor, offerQuantityFor)),
    clearAll: () => applyBulk('none', clearEveryOwned(materials, ownedFor)),
  }));

  function undo() {
    const patch = session.toast?.undo;
    if (patch) {
      if (patch.kind === 'owned') writeOwned(undoOwnedStockChanges(patch.changes));
      else onToggleBuildHere?.(patch.typeID);
    }
    dispatch({ type: 'undone' });
  }

  const sectionLabel = useCallback((errand: MaterialErrand) => t(ERRAND_LABEL_KEY[errand]), [t]);

  function toastText(message: SessionToastMessage): string {
    switch (message.kind) {
      case 'moved':
        return t('industry.errands.moved', {
          material: nameFor(message.typeID),
          section: sectionLabel(message.to),
        });
      case 'movedMany':
        return t('industry.errands.movedMany', { count: message.count });
      default:
        return ownedStockBulkText(t, message);
    }
  }

  const commitOwned = useCallback(
    (typeID: number, ownedQuantity: number | undefined) => {
      dispatch({
        type: 'haveCommitted',
        typeID,
        before: sourcing?.[typeID]?.ownedQuantity,
        after: ownedQuantity,
      });
      onSourcingChange(typeID, { ownedQuantity });
    },
    [sourcing, onSourcingChange]
  );

  const toggleBuild = useCallback(
    (material: MaterialTableRow) => {
      if (!onToggleBuildHere) return;
      dispatch({
        type: 'buildToggled',
        typeID: material.typeID,
        building: material.subBuilds.length > 0,
      });
      onToggleBuildHere(material.typeID);
    },
    [onToggleBuildHere]
  );

  function buildChoice(material: MaterialTableRow) {
    return {
      advice: makeOrBuy?.get(material.typeID),
      toggleable: canBuildHere?.(material.typeID) === true && onToggleBuildHere !== undefined,
    };
  }

  function buildSavingsOf(material: MaterialTableRow): number | null {
    return buildSavings(material, buildChoice(material).advice);
  }

  function renderName(material: MaterialTableRow, withAction: boolean, badge = false) {
    const name = nameFor(material.typeID);
    const { advice, toggleable } = buildChoice(material);
    const skillGate = isBuilt(material) ? skillGates?.get(material.typeID) : undefined;
    return (
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ItemInfoLink typeId={material.typeID}>{name}</ItemInfoLink>
          {!toggleable && !material.acquisitionTier && advice && (
            <MakeOrBuyMarker advice={advice} remaining={material.remainingQuantity} badge={badge} />
          )}
          {skillGate?.gated && characterNameFor && (
            <SkillGateMarker
              verdict={skillGate}
              nameForSkill={nameFor}
              nameForCharacter={characterNameFor}
            />
          )}
        </span>
        {withAction && renderAction(material)}
      </span>
    );
  }

  function renderAction(material: MaterialTableRow, withSavings = true) {
    const name = nameFor(material.typeID);
    if (material.acquisitionTier) {
      return onOpenAcquisitionPicker ? (
        <button
          type="button"
          aria-label={t('industry.errands.changeTierFor', { material: name })}
          className={linkClassName('blueprint')}
          onClick={() => onOpenAcquisitionPicker(material.typeID)}
        >
          {t('industry.errands.changeTier')}
        </button>
      ) : null;
    }
    const { advice, toggleable } = buildChoice(material);
    if (isBuilt(material)) {
      const savings = withSavings ? buildSavingsOf(material) : null;
      if (!onShowRecipe && !toggleable && savings === null) return null;
      return (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          {savings !== null && (
            <span className="text-[0.6875rem] text-success tabular-nums">
              {t('industry.errands.savesVsBuying', { amount: formatIskCompact(savings) })}
            </span>
          )}
          {onShowRecipe && (
            <button
              type="button"
              aria-label={t('industry.errands.recipeFor', { material: name })}
              className={linkClassName('accent')}
              onClick={() => onShowRecipe(material.typeID)}
            >
              {t('industry.errands.recipe')}
            </button>
          )}
          {toggleable && (
            <SwapButton
              material={material}
              name={name}
              kind="buy"
              advice={advice}
              onClick={() => toggleBuild(material)}
            />
          )}
        </span>
      );
    }
    return toggleable ? (
      <SwapButton
        material={material}
        name={name}
        kind="build"
        advice={advice}
        skillGate={skillGates?.get(material.typeID)}
        nameForCharacter={characterNameFor}
        nameForSkill={nameFor}
        onClick={() => toggleBuild(material)}
      />
    ) : null;
  }

  function renderOwnedHint(material: MaterialTableRow) {
    if (!detection || material.acquisitionTier) return null;
    const claims = groupClaimsFor?.(material.typeID) ?? null;
    const offer = ownedStockOffer(
      material,
      offerQuantityFor(material.typeID),
      sourcing?.[material.typeID]?.ownedQuantity
    );
    const overClaim = claims && !detection.lowerBound ? claims.overClaim : 0;
    return (
      <>
        {overClaim > 0 && (
          <span className="text-[0.6875rem] text-warning">
            {t('industry.groupOverClaim', { quantity: formatCount(overClaim) })}
          </span>
        )}
        {offer !== null && (
          <OwnedStockHint
            scopedQuantity={detection.scopedQuantityFor(material.typeID)}
            detection={detection}
            materialName={nameFor(material.typeID)}
            suggestion={offer}
            claimedAhead={claims?.ahead}
            reduction={detection.reducedFor?.(material.typeID) ?? null}
            onApply={() => commitOwned(material.typeID, offer)}
          />
        )}
      </>
    );
  }

  function renderHave(
    material: MaterialTableRow,
    withHint = true,
    fill = false,
    autoFocus = false,
    seed?: string,
    onSettle?: () => void
  ) {
    if (material.acquisitionTier) {
      return material.remainingQuantity === 0 ? (
        <span className="text-[0.6875rem] text-text-dim">
          {t('industry.blueprintAcquisitionOwned')}
        </span>
      ) : (
        <NotApplicable />
      );
    }
    const owned = sourcing?.[material.typeID]?.ownedQuantity;
    return (
      <span className={cx('flex flex-col items-start gap-0.5 sm:items-end', fill && 'w-full')}>
        <SourcingInput
          value={owned}
          label={t('industry.errands.haveFor', { material: nameFor(material.typeID) })}
          inputMode="numeric"
          widthClassName={fill ? 'w-full' : 'w-20'}
          autoFocus={autoFocus}
          seed={seed}
          onSettle={onSettle}
          placeholder="0"
          mine={owned !== undefined && owned > 0}
          parse={unmaskCount}
          onCommit={(ownedQuantity) => commitOwned(material.typeID, ownedQuantity)}
        />
        {withHint && renderOwnedHint(material)}
      </span>
    );
  }

  function renderHaveCell(material: MaterialTableRow) {
    if (material.acquisitionTier) return renderHave(material);
    if (editingHave === material.typeID) {
      return (
        <span onBlur={whenFocusLeaves(() => editHave(null))}>
          {renderHave(material, true, false, true, editSeed, settleHave(material.typeID))}
        </span>
      );
    }
    const owned = sourcing?.[material.typeID]?.ownedQuantity ?? 0;
    return (
      <span className="flex flex-col items-start gap-0.5 sm:items-end">
        <EditableValue
          focusOnMount={refocus === `have-${material.typeID}`}
          onFocused={clearRefocus}
          label={t('industry.errands.editHaveFor', { material: nameFor(material.typeID) })}
          onEdit={(seed) => editHave(material.typeID, seed)}
          className={owned > 0 ? 'text-accent' : 'text-text-dim'}
        >
          {formatCount(owned)}
        </EditableValue>
        {renderOwnedHint(material)}
      </span>
    );
  }

  function renderPrice(material: MaterialTableRow, inline = false, autoFocus = false) {
    const name = nameFor(material.typeID);
    const priceTag = materialPriceTag(material, sourcing, pricesReady);
    if (isBuilt(material)) {
      return priceTag === 'unpriced' ? (
        <span className="text-[0.6875rem] text-warning">{t('industry.unpriced')}</span>
      ) : (
        <NotApplicable />
      );
    }
    const state = materialRowState(material, sourcing, pricesReady);
    const overridden = state.priceSource === 'override';
    const depth = inline ? undefined : shownDepth(material, sourcing, depthFor);
    const unpriced = priceTag === 'unpriced';
    const tag =
      priceTag === 'override'
        ? { text: t('industry.priceSourceOverride'), tone: 'text-accent' }
        : priceTag === 'owned'
          ? { text: t('industry.priceSourceOwned'), tone: 'text-text-dim' }
          : priceTag === 'unpriced'
            ? { text: t('industry.unpriced'), tone: 'text-warning' }
            : null;
    const onFindBlueprint =
      unpriced && pricesReady && material.acquisitionTier && onOpenAcquisitionPicker
        ? () => onOpenAcquisitionPicker(material.typeID)
        : undefined;
    return (
      <span
        className={
          inline
            ? 'inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5'
            : 'flex flex-col items-start gap-0.5 sm:items-end'
        }
      >
        {inline && (
          <span className="text-text-dim" aria-hidden="true">
            {t('industry.errands.at')}
          </span>
        )}
        {!inline && editingPrice !== material.typeID && state.unitPrice !== null ? (
          <EditableValue
            focusOnMount={refocus === `price-${material.typeID}`}
            onFocused={clearRefocus}
            label={t('industry.editPriceFor', { material: name })}
            onEdit={(seed) => editPrice(material.typeID, seed)}
            className={
              overridden ? 'text-accent' : state.fullyOwned ? 'text-text-dim' : 'text-text'
            }
          >
            {maskIsk(state.unitPrice)}
          </EditableValue>
        ) : (
          <span onBlur={inline ? undefined : whenFocusLeaves(() => editPrice(null))}>
            <SourcingInput
              value={state.unitPrice === null ? undefined : roundIsk(state.unitPrice)}
              label={t('industry.priceFor', { material: name })}
              inputMode="decimal"
              widthClassName="w-24"
              mine={overridden}
              autoFocus={autoFocus || editingPrice === material.typeID}
              seed={editingPrice === material.typeID ? editSeed : undefined}
              onSettle={editingPrice === material.typeID ? settlePrice(material.typeID) : undefined}
              parse={parsePrice}
              onCommit={(overridePrice) => onSourcingChange(material.typeID, { overridePrice })}
            />
          </span>
        )}
        {inline && <span className="text-text-dim">{t('industry.errands.isk')}</span>}
        {(tag || overridden) && (
          <span className="inline-flex items-center gap-1">
            {onFindBlueprint ? (
              <button
                type="button"
                aria-label={t('industry.blueprintAcquisitionFindFor', { material: name })}
                className={textActionClassName('whitespace-nowrap')}
                onClick={onFindBlueprint}
              >
                {t('industry.blueprintAcquisitionFind')}
              </button>
            ) : (
              tag && <span className={cx('text-[0.6875rem]', tag.tone)}>{tag.text}</span>
            )}
            {overridden && (
              <IconButton
                size="sm"
                variant="plain"
                icon={<Icon.Revert size={Icon.ICON_SIZE.sm} />}
                label={t('industry.resetPriceFor', { material: name })}
                onClick={() => onSourcingChange(material.typeID, { overridePrice: undefined })}
              />
            )}
          </span>
        )}
        {depth && <DepthPriceLine depth={depth} />}
        {!inline && material.acquisitionTier && (
          <span className="text-[0.6875rem] text-text-dim">
            {material.acquisitionTier.community
              ? t(
                  material.acquisitionTier.community.stale
                    ? 'industry.blueprintAcquisitionTierStale'
                    : 'industry.blueprintAcquisitionTierCommunity',
                  {
                    ...material.acquisitionTier,
                    name: material.acquisitionTier.community.memberName,
                  }
                )
              : t(
                  material.acquisitionTier.copyOnly
                    ? 'industry.blueprintAcquisitionTierCopyOnly'
                    : material.acquisitionTier.invented
                      ? 'industry.blueprintAcquisitionTierInvented'
                      : 'industry.blueprintAcquisitionTier',
                  material.acquisitionTier
                )}
          </span>
        )}
      </span>
    );
  }

  function renderTotal(material: MaterialTableRow) {
    if (material.subBuilds.length > 0) {
      const recipe = buildRecipe(material);
      if (recipe?.split) return <span>{jobsOfRuns(t, recipe.jobRuns)}</span>;
      return <span>{t('industry.subBuildRuns', { runs: formatCount(recipe?.runs ?? 0) })}</span>;
    }
    const sellValue =
      material.remainingQuantity === 0 ? sellValueFor?.(material.typeID) : undefined;
    if (sellValue !== undefined) {
      return (
        <span className="whitespace-nowrap text-text-dim">
          {t('industry.errands.rowSellsFor', { amount: formatIskCompact(sellValue) })}
        </span>
      );
    }
    const state = materialRowState(material, sourcing, pricesReady);
    return (
      <span>
        {state.lineCost === null ? (
          t('common.unknown')
        ) : (
          <IskAmount value={state.lineCost} decimals={0} />
        )}
      </span>
    );
  }

  const anyDepth = materials.some((m) => shownDepth(m, sourcing, depthFor) !== undefined);
  const columns = buildMaterialsColumns({
    t,
    nameFor,
    volumeFor,
    sourcing,
    pricesReady,
    anyDepth,
    renderName,
    renderHave: renderHaveCell,
    renderPrice,
    renderTotal,
  });

  const tableColumns = besideCosts ? columns.filter((column) => column.id !== 'volume') : columns;

  function holdSection(errand: MaterialErrand) {
    dispatch({ type: 'focusEntered', errand, typeIDs: groups[errand].map((row) => row.typeID) });
  }

  function releaseSection(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    dispatch({ type: 'focusLeft' });
  }

  function renderHeading(errand: MaterialErrand, rows: readonly MaterialTableRow[]) {
    const Glyph = ERRAND_GLYPH[errand];
    const headingId = `${idPrefix}-${errand}`;
    const subtotal =
      errand === 'toBuy' || errand === 'blueprint'
        ? errandSubtotal(rows, sourcing, pricesReady)
        : null;
    const saved =
      errand === 'building' ? rows.reduce((sum, row) => sum + (buildSavingsOf(row) ?? 0), 0) : 0;
    const cheaperBuilt =
      errand === 'toBuy' && onBuildAll
        ? rows.filter(
            (row) => !isBuilt(row) && buildSavingsOf(row) !== null && buildChoice(row).toggleable
          )
        : [];
    const cheaperSaves = cheaperBuilt.reduce((sum, row) => sum + (buildSavingsOf(row) ?? 0), 0);
    const title = (
      <span className="inline-flex items-center gap-1.5">
        {Glyph && <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
        {t('industry.errands.heading', { section: sectionLabel(errand), count: rows.length })}
      </span>
    );
    return (
      <div
        className={cx(
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-2 py-1.5',
          !isPhone && 'bg-panel-2'
        )}
      >
        <h3
          id={headingId}
          className={cx(
            'text-[0.6875rem] font-semibold tracking-widest uppercase',
            ERRAND_TONE[errand]
          )}
        >
          {errand === 'have' ? (
            <button
              type="button"
              aria-expanded={haveOpen}
              onClick={() => setHaveOpen((open) => !open)}
              className={cx(
                'inline-flex min-h-9 items-center gap-1 rounded-xs uppercase hover:text-text md:min-h-0',
                interactiveClassName,
                focusRingClassName
              )}
            >
              <Caret expanded={haveOpen} />
              {title}
            </button>
          ) : (
            title
          )}
        </h3>
        {cheaperBuilt.length >= 2 && onBuildAll && (
          <button
            type="button"
            className={textActionClassName('mr-auto')}
            onClick={() => onBuildAll(cheaperBuilt.map((row) => row.typeID))}
          >
            {t('industry.errands.buildCheaper', {
              count: cheaperBuilt.length,
              amount: formatIskCompact(cheaperSaves),
            })}
          </button>
        )}
        {errand === 'toBuy' && onBuyOre && (
          <button type="button" className={textActionClassName('mr-auto')} onClick={onBuyOre}>
            {t('industry.buyOre.action')}
          </button>
        )}
        {errand === 'have' && ownedSellNet != null && ownedSellNet > 0 && (
          <span className="ml-auto text-[0.6875rem] text-text-dim tabular-nums">
            {t('industry.errands.haveSellsFor', { amount: formatIskCompact(ownedSellNet) })}
          </span>
        )}
        {saved > 0 && (
          <span className="text-[0.6875rem] font-semibold text-success tabular-nums">
            {t('industry.errands.saves', { amount: formatIskCompact(saved) })}
          </span>
        )}
        {errand === 'have' && !haveOpen ? (
          <span className="min-w-0 truncate text-[0.6875rem] text-text-dim">
            {rows.map((row) => nameFor(row.typeID)).join(', ')}
          </span>
        ) : (
          subtotal && (
            <span className="flex items-baseline gap-2 text-xs font-semibold tabular-nums">
              {subtotal.unpricedCount > 0 && (
                <span className="text-[0.6875rem] font-normal text-warning">
                  {t('industry.errands.unpricedCount', { count: subtotal.unpricedCount })}
                </span>
              )}
              <IskAmount value={subtotal.total} decimals={0} />
            </span>
          )
        )}
      </div>
    );
  }

  function sortForPhone(rows: readonly MaterialTableRow[]): readonly MaterialTableRow[] {
    if (phoneSort === 'plan') return rows;
    const keyed = rows.map((row) => ({
      row,
      key:
        phoneSort === 'name'
          ? nameFor(row.typeID)
          : phoneSort === 'toBuy'
            ? isBuilt(row)
              ? null
              : row.remainingQuantity
            : isBuilt(row)
              ? null
              : materialRowState(row, sourcing, pricesReady).lineCost,
    }));
    keyed.sort((a, b) => {
      if (a.key === null || b.key === null) return a.key === b.key ? 0 : a.key === null ? 1 : -1;
      if (typeof a.key === 'string' && typeof b.key === 'string') return a.key.localeCompare(b.key);
      return (b.key as number) - (a.key as number);
    });
    return keyed.map((entry) => entry.row);
  }

  const visible = MATERIAL_ERRANDS.filter((errand) => groups[errand].length > 0);

  const sortPicker = (
    <NativeSelect
      size="sm"
      className="w-32 shrink-0 [&>select]:min-h-9 [&>select]:normal-case"
      value={phoneSort}
      onChange={(event) => setPhoneSort(event.target.value as PhoneSort)}
    >
      {PHONE_SORTS.map((key) => (
        <option key={key} value={key}>
          {t(`industry.errands.sort.${key}`)}
        </option>
      ))}
    </NativeSelect>
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {isPhone && visible.length > 0 && (
        <label className="flex items-center justify-end gap-2 text-xs text-text-dim">
          {t('industry.errands.sortLabel')}
          {sortPicker}
        </label>
      )}
      {visible.map((errand) => {
        const rows = groups[errand];
        const open = errand !== 'have' || haveOpen;
        return (
          <section
            key={errand}
            aria-labelledby={`${idPrefix}-${errand}`}
            onFocus={() => holdSection(errand)}
            onBlur={releaseSection}
          >
            {renderHeading(errand, rows)}
            {open &&
              (isPhone ? (
                <>
                  <ul>
                    {sortForPhone(rows).map((material) => (
                      <MaterialsPhoneRow
                        key={material.typeID}
                        material={material}
                        sourcing={sourcing}
                        pricesReady={pricesReady}
                        nameFor={nameFor}
                        depth={shownDepth(material, sourcing, depthFor)}
                        savings={isBuilt(material) ? buildSavingsOf(material) : null}
                        editingHave={editingHave === material.typeID}
                        editingPrice={editingPrice === material.typeID}
                        onEditHave={(seed) => editHave(material.typeID, seed)}
                        onStopEditingHave={() => editHave(null)}
                        onEditPrice={(seed) => editPrice(material.typeID, seed)}
                        refocusHave={refocus === `have-${material.typeID}`}
                        refocusPrice={refocus === `price-${material.typeID}`}
                        onRefocused={clearRefocus}
                        onStopEditingPrice={() => editPrice(null)}
                        name={renderName(material, false, true)}
                        total={renderTotal(material)}
                        ownedHint={renderOwnedHint(material)}
                        action={renderAction(material, false)}
                        menu={itemActionsFor?.(material.typeID, false, usedByItem(material))}
                        haveField={
                          editingHave === material.typeID
                            ? renderHave(
                                material,
                                false,
                                true,
                                true,
                                editSeed,
                                settleHave(material.typeID)
                              )
                            : null
                        }
                        priceField={(autoFocus) => renderPrice(material, true, autoFocus)}
                        unpricedField={isBuilt(material) ? renderPrice(material) : null}
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <TableScroll>
                  <DataTable
                    {...exportProps}
                    rowContextMenu={rowContextMenu}
                    rowMoreActions={itemMenuFor !== undefined}
                    columns={tableColumns}
                    rows={rows}
                    className="table-fixed"
                    rowKey={(material) => material.typeID}
                    label={t('industry.errands.tableLabel', { section: sectionLabel(errand) })}
                    density="compact"
                  />
                </TableScroll>
              ))}
          </section>
        );
      })}
      {toast && (
        <Toast
          message={toastText(toast.message)}
          instance={toast}
          undo={toast.undo ? { label: t('industry.errands.undo'), onUndo: undo } : undefined}
          onClose={() => dispatch({ type: 'toastExpired' })}
        />
      )}
    </div>
  );
}
