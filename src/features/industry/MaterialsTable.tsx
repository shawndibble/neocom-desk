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
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  DataTable,
  EditableValue,
  IconButton,
  IskAmount,
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
import { formatIskCompact } from '@/lib/isk';
import { maskNumber, unmaskCount, unmaskNumber } from '@/lib/numberMask';
import { ItemInfoLink } from '@/features/entities';
import { buildMaterialsColumns } from './MaterialsColumns';
import { NotApplicable } from './NotApplicable';
import { whenFocusLeaves } from './focusLeaves';
import { materialRowState } from './materialRow';
import { DepthPriceLine } from './DepthPriceLine';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import {
  clearEveryOwned,
  ownedStockOffer,
  takeEveryOffer,
  undoOwnedStockChanges,
  type OwnedStockChange,
} from '@/engine/industry/ownedStockOffer';
import type { GroupStockClaims } from '@/engine/industry/groupStockClaims';
import { OwnedStockHint } from './OwnedStockHint';
import type { OwnedStockDetection } from './ownedStockDetection';
import { buildRecipe, type MaterialTableRow } from './subBuildPlan';
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

interface MaterialsTableProps {
  /** Engine cost lines — already resolved against the plan's sourcing overrides and hub prices. */
  materials: readonly MaterialTableRow[];
  nameFor: (typeID: number) => string;
  /** Per-unit m3 volume for a typeID, baked SDE data; null when unresolvable (issue #874). */
  volumeFor: (typeID: number) => number | null;
  /** The plan's raw overrides. Needed to tell an override apart from a hub price of the same value. */
  sourcing: MaterialSourcingMap | undefined;
  /** False when the market snapshot couldn't be fetched — hub prices fall back to placeholder text. */
  pricesReady: boolean;
  /** A material's Depth Price walk; absent for a row priced at the lowest sell. */
  depthFor?: (typeID: number) => DepthPrice | undefined;
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
  /**
   * Writes several rows' owned quantities as one change — "Use all", "Use
   * none" and every Undo. Omitted, each goes through `onSourcingChange`.
   */
  onOwnedStockChange?: (changes: readonly OwnedStockChange[]) => void;
  /** "Use all" / "Use none" for controls the caller renders outside the table. */
  ref?: Ref<MaterialsTableHandle>;
  /** ESI-detected owned stock (issue #181); omitted where no detection ran. Never written by itself. */
  detection?: OwnedStockDetection;
  /**
   * What other members of this plan's Build Group claimed of each material's
   * scoped stock (issue #3992); `null` where none did. Omitted for a
   * standalone plan and on the group page, whose offers stay as they were.
   */
  groupClaimsFor?: (typeID: number) => GroupStockClaims | null;
  /** Make-or-buy verdicts by material typeID. A material with no entry has no advice to show; omitted entirely where the caller can't price recipes. */
  makeOrBuy?: ReadonlyMap<number, MakeOrBuy>;
  /**
   * Whether a material can be produced here rather than bought — a blueprint
   * makes it. Deliberately independent of `makeOrBuy`, which needs live prices:
   * the run count and input quantities do not, so an unpriced row can still be
   * expanded. Omitted where the caller cannot look recipes up at all.
   */
  canBuildHere?: (typeID: number) => boolean;
  /** Turns one material's sub-build on or off. Omitted alongside `canBuildHere`. */
  onToggleBuildHere?: (typeID: number) => void;
  /**
   * Switches several bought materials to built at once — the To buy
   * heading's link when two or more rows would be cheaper to build.
   */
  onBuildAll?: (typeIDs: readonly number[]) => void;
  /**
   * Opens "Buy ore instead" (issue #5134) from the To buy heading. Passed only
   * while the plan still has a mineral to buy.
   */
  onBuyOre?: () => void;
  /**
   * What the owned units this job consumes would net if sold, after fees;
   * shown on the folded owned section's heading. Omitted when unknown.
   */
  ownedSellNet?: number | null;
  /** What one material's owned units would net if sold; shown in a fully owned row's Total cell. */
  sellValueFor?: (typeID: number) => number | undefined;
  /**
   * Opens the "Build it" modal for a material being built here — the runs and
   * ingredient list the Building row's Recipe link opens. Omitted
   * where the caller has no modal to open, which simply drops the link.
   */
  onShowRecipe?: (typeID: number) => void;
  /**
   * Opens the picker/override modal (issue #839) for a Blueprint Acquisition
   * row — present alongside `material.acquisitionTier` exactly where that
   * caption renders. Omitted where the caller has no modal to open, which
   * simply drops the trigger.
   */
  onOpenAcquisitionPicker?: (typeID: number) => void;
  /**
   * Skill-gate verdicts by material typeID, for a sub-build row — a job the
   * plan chose, not the pilot. Only `gated: true` renders anything; omitted
   * entirely drops the marker. `characterNameFor` names the closest character.
   */
  skillGates?: ReadonlyMap<number, SkillGateVerdict>;
  characterNameFor?: (characterId: number) => string;
  /** `useTableExport(...).tableProps` — makes the table exportable from its row menus. */
  exportProps?: UseTableExport<MaterialTableRow>['tableProps'];
}

/**
 * "Use all" / "Use none" over every row on the table, answered by the table's
 * own toast so a row edit and a bulk one share one Undo (issue #2548).
 */
export interface MaterialsTableHandle {
  fillAll: () => void;
  clearAll: () => void;
}

const parsePrice = unmaskNumber;

/** `xl` (78.125rem, src/styles/index.css) up to `2xl`: where BuildPlanDetail puts Costs & revenue beside Materials. */
const BESIDE_COSTS_QUERY = '(min-width: 78.125rem) and (max-width: 95.999rem)';

/** The phone list's own sort — the header sort buttons are a table's, and a phone gets no table. */
type PhoneSort = 'plan' | 'total' | 'toBuy' | 'name';
const PHONE_SORTS: readonly PhoneSort[] = ['plan', 'total', 'toBuy', 'name'];

/** A material being built here rather than bought. */
function isBuilt(material: MaterialTableRow): boolean {
  return material.subBuilds.length > 0;
}

/**
 * Materials, as a shopping list: one section per errand — To buy, Building,
 * Blueprint, Already have (`materialErrands.ts`) — each headed by its colour,
 * glyph, count and what it still costs.
 *
 * At `sm` and up every section is its own table over one shared column set, so
 * Need − Have = To buy reads left to right and the columns line up from one
 * section to the next. Below `sm` the same sections become a list whose rows
 * spell that subtraction out on one line, with the Have field in it; the
 * labelled card the shared DataTable stacks into put six equal-weight labels
 * on every material.
 *
 * A row changes section when the player's edit changes its errand — owning
 * all of it, or switching it to be built. Two rules keep that from being
 * disorienting:
 *
 * - A section holds its rows in place while focus is inside it, so a Have
 *   commit (which lands on blur, as the player tabs on) never unmounts the
 *   field focus is moving to. Rows move once focus leaves the section.
 * - Every move the player caused is confirmed by a toast with Undo — one
 *   toast and one Undo shared with "Use all" / "Use none" (`fillAll` /
 *   `clearAll` on the `ref`).
 *
 * Both rules, and which toast an edit earns, are the edit session's
 * (`materialsEditSession.ts`); this component renders what it decides and
 * makes the writes.
 *
 * Price is one field, not a market column beside an override column: the hub
 * price is its value and typing over it is the override, with a revert
 * control beside a changed field. `SourcingInput`'s commit rule keeps that
 * safe — a field blurred as it was found writes nothing.
 */
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
  skillGates,
  characterNameFor,
  exportProps,
  depthFor,
}: MaterialsTableProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const besideCosts = useMediaQuery(BESIDE_COSTS_QUERY);
  const idPrefix = useId();

  const [session, dispatch] = useReducer(reduceEditSession, INITIAL_EDIT_SESSION);
  const [haveOpen, setHaveOpen] = useState(false);
  const [phoneSort, setPhoneSort] = useState<PhoneSort>('plan');
  // The phone card whose price field is open; every other card shows its
  // price as text.
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  // Same for the ledger's Have number.
  const [editingHave, setEditingHave] = useState<number | null>(null);
  // The digit typed on a value that opened its field (`EditableValue`), so
  // tabbing down a column and typing keeps the first keystroke.
  const [editSeed, setEditSeed] = useState<string | undefined>(undefined);
  function editHave(typeID: number | null, seed?: string) {
    setEditSeed(seed);
    setEditingHave(typeID);
  }
  function editPrice(typeID: number | null, seed?: string) {
    setEditSeed(seed);
    setEditingPrice(typeID);
  }
  // The value whose field Enter or Escape just closed: it takes focus back as
  // it remounts (§6c, `useInPlaceEdit`'s contract), keyed "have-34" / "price-34".
  const [refocus, setRefocus] = useState<string | null>(null);
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
  // The stock a row's offer and "Use all" may draw on: the scoped stock, less
  // what group members ahead of this plan already claimed.
  const offerQuantityFor = (typeID: number) =>
    groupClaimsFor?.(typeID)?.free ?? detection?.scopedQuantityFor(typeID) ?? 0;

  // Owned-quantity writes the session makes (bulk, and every Undo) go out as
  // one batch where the caller takes one.
  function writeOwned(changes: readonly OwnedStockChange[]) {
    if (onOwnedStockChange) onOwnedStockChange(changes);
    else for (const { typeID, to } of changes) onSourcingChange(typeID, { ownedQuantity: to });
  }

  // The session confirms the moves an edit caused once they are actually
  // shown, so it watches every render that could have moved a row.
  useEffect(() => {
    dispatch({ type: 'rendered', shown, ownedFor });
  }, [shown, ownedFor]);

  const toast = session.toast;

  // Runs after every render: the toggled row only reaches its new section
  // once the plan write lands, which can be several renders later.
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
      // It moved somewhere its control isn't mounted — the folded Already
      // have section. Give up rather than steal focus whenever that opens.
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

  // Built per render, so Undo writes through the latest props: a write made
  // while the toast was up isn't dropped by a stale callback.
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

  /** The make-or-buy advice for a row, and whether a Build/Buy instead switch is offered on it. */
  function buildChoice(material: MaterialTableRow) {
    return {
      advice: makeOrBuy?.get(material.typeID),
      toggleable: canBuildHere?.(material.typeID) === true && onToggleBuildHere !== undefined,
    };
  }

  /** What building saves over buying, when the advice says building is cheaper. */
  function buildSavings(material: MaterialTableRow): number | null {
    const { advice } = buildChoice(material);
    return advice?.verdict === 'build' && advice.savings > 0 && material.remainingQuantity > 0
      ? advice.savings
      : null;
  }

  /** The name, any advice/skill marker, and — unless the caller places it itself — the row's text action. */
  function renderName(material: MaterialTableRow, withAction: boolean, badge = false) {
    const name = nameFor(material.typeID);
    const { advice, toggleable } = buildChoice(material);
    // Only a built row names what blocks it. A bought row carries no gate
    // text: its lock sits on the Build instead button (see `SwapButton`).
    const skillGate = isBuilt(material) ? skillGates?.get(material.typeID) : undefined;
    return (
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ItemInfoLink typeId={material.typeID}>{name}</ItemInfoLink>
          {/* Advice with nothing to act on here — a material something
              else produces. Inline after the name, not in a reserved slot
              before it, so every name starts at the same edge. */}
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

  /** Recipe · Buy instead, Build instead, or Change tier — whichever this row's errand offers. */
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
      const savings = withSavings ? buildSavings(material) : null;
      if (!onShowRecipe && !toggleable && savings === null) return null;
      return (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          {/* What this build is worth, in the same green its heading uses. */}
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

  /** The Have field, with the detected-stock offer under it. A blueprint row only ever says Owned. */
  /**
   * The detected-stock offer ("Use assets") for a row, or nothing. Its own
   * piece so the phone row can put it on the line under the subtraction
   * instead of inside it, where it split Need − Have = To buy over two lines.
   *
   * Inside a Build Group it also carries the over-claim warning (issue
   * #3992), shown whether or not the row still has an offer: a member whose
   * Have already fills its need has none, and is exactly the one to warn.
   * Not on a lower-bound count, which may simply be short.
   */
  function renderOwnedHint(material: MaterialTableRow) {
    if (!detection || material.acquisitionTier) return null;
    // Whether the row offers anything, and what, is the owned-stock offer's
    // call (`ownedStockOffer.ts`) — the same rule "Use all" applies. It
    // respects the plan's owned-stock scope (issue #454).
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
    // Blueprint Acquisition (issue #838): ownership comes entirely from the
    // Character's real BPO/BPC, never from a typed quantity — an editable
    // field here would silently do nothing.
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

  /**
   * The table's Have cell: the count edited in place (§6c faint pencil), the
   * field only while it is being edited, and the row's owned-stock offer
   * under it. A Blueprint Acquisition row keeps `renderHave`'s own readout.
   */
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

  function depthOf(material: MaterialTableRow): DepthPrice | undefined {
    return material.subBuilds.length > 0 ? undefined : depthFor?.(material.typeID);
  }

  /**
   * The price field and what kind of price it holds. A built row has no
   * purchase price at all. `inline` is the phone row's form: "@ [field]" on
   * one line with its tag beside it rather than stacked under it, and no tier
   * caption, which the phone row prints beside Change tier instead.
   */
  function renderPrice(material: MaterialTableRow, inline = false, autoFocus = false) {
    const name = nameFor(material.typeID);
    if (material.subBuilds.length > 0) {
      // "Something under this has no price" is a warning about the plan's
      // totals, not a price — hiding it would quietly understate the cost.
      return material.unpriced ? (
        <span className="text-[0.6875rem] text-warning">{t('industry.unpriced')}</span>
      ) : (
        <NotApplicable />
      );
    }
    const state = materialRowState(material, sourcing, pricesReady);
    const overridden = state.priceSource === 'override';
    const depth = inline || overridden ? undefined : depthOf(material);
    const unpriced = !overridden && state.unitPrice === null && !state.fullyOwned;
    // No tag on a plain hub price — that is what every row is unless
    // something says otherwise.
    const tag = overridden
      ? { text: t('industry.priceSourceOverride'), tone: 'text-accent' }
      : state.unitPrice !== null
        ? null
        : state.fullyOwned
          ? { text: t('industry.priceSourceOwned'), tone: 'text-text-dim' }
          : { text: t('industry.unpriced'), tone: 'text-warning' };
    // Only once prices have landed: before then every row reads as unpriced.
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
          // Stays a value to edit even once the row is fully owned: Tab out of
          // its Have lands here, and a value that vanished under focus would
          // drop the player at the top of the page. Dim then — nothing is bought.
          <EditableValue
            focusOnMount={refocus === `price-${material.typeID}`}
            onFocused={clearRefocus}
            label={t('industry.editPriceFor', { material: name })}
            onEdit={(seed) => editPrice(material.typeID, seed)}
            className={
              overridden ? 'text-accent' : state.fullyOwned ? 'text-text-dim' : 'text-text'
            }
          >
            {maskNumber(state.unitPrice)}
          </EditableValue>
        ) : (
          <span onBlur={inline ? undefined : whenFocusLeaves(() => editPrice(null))}>
            <SourcingInput
              value={state.unitPrice ?? undefined}
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
                  material.acquisitionTier.invented
                    ? 'industry.blueprintAcquisitionTierInvented'
                    : 'industry.blueprintAcquisitionTier',
                  material.acquisitionTier
                )}
          </span>
        )}
      </span>
    );
  }

  /** The line total — or, for a built row, its runs: its inputs carry the cost in their own rows. */
  function renderTotal(material: MaterialTableRow) {
    if (material.subBuilds.length > 0) {
      const runs = buildRecipe(material)?.runs ?? 0;
      return <span>{t('industry.subBuildRuns', { runs: formatCount(runs) })}</span>;
    }
    const sellValue =
      material.remainingQuantity === 0 ? sellValueFor?.(material.typeID) : undefined;
    if (sellValue !== undefined) {
      // A fully owned row costs nothing; what it would fetch is the number worth reading.
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
          // Long press, not tap: the row's own tap belongs to its context menu.
          <IskAmount value={state.lineCost} decimals={0} />
        )}
      </span>
    );
  }

  // Rebuilt every render, deliberately: the cell renderers close over the
  // hold and toggle machinery above, and a stale closure there would commit
  // an edit through an outdated sourcing map.
  const anyDepth = materials.some((m) => depthOf(m) !== undefined);
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

  // Dropped only where Materials shares its row with Costs & revenue (`xl`
  // up to `2xl`): that panel already totals the plan's volume, and the
  // table has to fit beside it without a sideways scroll (#2165).
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
      errand === 'building' ? rows.reduce((sum, row) => sum + (buildSavings(row) ?? 0), 0) : 0;
    // Bought rows that would be cheaper built: one link for all of them, so the
    // suggestion is a line of the heading rather than a banner competing with
    // the verdict. One row keeps only its own Build instead.
    const cheaperBuilt =
      errand === 'toBuy' && onBuildAll
        ? rows.filter(
            (row) => !isBuilt(row) && buildSavings(row) !== null && buildChoice(row).toggleable
          )
        : [];
    const cheaperSaves = cheaperBuilt.reduce((sum, row) => sum + (buildSavings(row) ?? 0), 0);
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
          // On a phone the heading is a rule over its cards, not a filled bar
          // — one more box around boxes there.
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
            // Folded by default: nothing on these rows needs doing.
            <button
              type="button"
              aria-expanded={haveOpen}
              onClick={() => setHaveOpen((open) => !open)}
              className={cx(
                'inline-flex min-h-11 items-center gap-1 rounded-xs uppercase hover:text-text md:min-h-0',
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

  /** Within one section only — a sort never pulls a row out of its errand. */
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
      // Rows with nothing to sort by sink, as the table's own sort does.
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
      className="w-32 shrink-0 [&>select]:min-h-11 [&>select]:normal-case"
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
      {/* Once for the whole list, on its own line: inside the first heading a
          44px field made that heading the heaviest thing in the section. */}
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
                        depth={depthOf(material)}
                        savings={isBuilt(material) ? buildSavings(material) : null}
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
                <div className="overflow-x-auto">
                  <DataTable
                    {...exportProps}
                    columns={tableColumns}
                    rows={rows}
                    // Fixed layout over the same column widths in every
                    // section, so Need, Have and To buy line up from one
                    // section's table to the next; the name takes the rest.
                    className="table-fixed"
                    rowKey={(material) => material.typeID}
                    label={t('industry.errands.tableLabel', { section: sectionLabel(errand) })}
                    density="compact"
                  />
                </div>
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
