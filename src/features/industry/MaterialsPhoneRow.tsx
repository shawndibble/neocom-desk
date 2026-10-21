import type { FocusEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { MaterialSourcingMap } from '@/engine/industry/types';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { maskNumber } from '@/lib/numberMask';
import { DepthPriceLine } from './DepthPriceLine';
import { materialRowState } from './materialRow';
import { LEDGER_VALUE, editPencilClassName, editableValueClassName } from './materialsTableStyle';
import type { MaterialTableRow } from './subBuildPlan';
import { formatCount } from '@/lib/formatCount';

/** Calls `onLeave` once focus has left `event.currentTarget` altogether. */
function whenFocusLeaves(onLeave: () => void) {
  return (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave();
  };
}

interface PhoneHaveProps {
  material: MaterialTableRow;
  sourcing: MaterialSourcingMap | undefined;
  nameFor: (typeID: number) => string;
  editing: boolean;
  onEdit: () => void;
  onStopEditing: () => void;
  /** The Have field itself, shown while editing. */
  field: ReactNode;
}

/**
 * The ledger's Have: the number with a faint pencil — the price's own
 * "tap to edit" cue — rather than a field stretched across its column. Blue
 * when the player set it, faint at 0. A tap swaps in the field, focused;
 * leaving it swaps the number back. The 44px tap area is an invisible
 * `::after`, so the row stays one line tall.
 */
function PhoneHave({
  material,
  sourcing,
  nameFor,
  editing,
  onEdit,
  onStopEditing,
  field,
}: PhoneHaveProps) {
  const { t } = useTranslation();
  if (editing) {
    return (
      <span className="w-full" onBlur={whenFocusLeaves(onStopEditing)}>
        {field}
      </span>
    );
  }
  const owned = sourcing?.[material.typeID]?.ownedQuantity ?? 0;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cx(
        editableValueClassName,
        'tabular-nums',
        owned > 0 ? 'text-accent' : 'text-text-dim'
      )}
    >
      <span className="sr-only">
        {t('industry.errands.haveFor', { material: nameFor(material.typeID) })},{' '}
      </span>
      {formatCount(owned)}
      <Icon.Rename size={Icon.ICON_SIZE.sm} aria-hidden="true" className={editPencilClassName} />
    </button>
  );
}

interface PhonePriceProps {
  material: MaterialTableRow;
  sourcing: MaterialSourcingMap | undefined;
  pricesReady: boolean;
  nameFor: (typeID: number) => string;
  /** The row's Depth Price walk; absent for a built row or one priced at the lowest sell. */
  depth: DepthPrice | undefined;
  editing: boolean;
  onEdit: () => void;
  onStopEditing: () => void;
  /** The price field itself, shown while editing; `autoFocus` is true once the player asked to edit. */
  field: (autoFocus: boolean) => ReactNode;
}

/**
 * The phone card's price: "@ 3,320,000 ISK" as light text, the way the
 * mockup drew it, which becomes the field when tapped and goes back to text
 * once focus leaves it. A box on every card made the cards heavy, and gave
 * a card with nothing else on its last line a 44px line just for that box.
 * The tap area is still 44px tall — an invisible `::after` around the text —
 * so it costs no layout height. A row with no price yet stays the field,
 * since there is no number to show.
 */
function PhonePrice({
  material,
  sourcing,
  pricesReady,
  nameFor,
  depth,
  editing,
  onEdit,
  onStopEditing,
  field,
}: PhonePriceProps) {
  const { t } = useTranslation();
  const state = materialRowState(material, sourcing, pricesReady);
  if (editing || state.unitPrice === null) {
    return <span onBlur={whenFocusLeaves(onStopEditing)}>{field(editing)}</span>;
  }
  const overridden = state.priceSource === 'override';
  const shownDepth = overridden ? undefined : depth;
  return (
    <>
      <button
        type="button"
        onClick={onEdit}
        className={cx(
          editableValueClassName,
          'text-xs tabular-nums',
          overridden ? 'text-accent' : 'text-text'
        )}
      >
        <span className="sr-only">
          {t('industry.priceFor', { material: nameFor(material.typeID) })}:{' '}
        </span>
        {t('industry.errands.atPrice', { price: maskNumber(state.unitPrice) })}
        {overridden && (
          <span className="ml-1.5 text-[0.6875rem] no-underline">
            {t('industry.priceSourceOverride')}
          </span>
        )}
        <Icon.Rename size={Icon.ICON_SIZE.sm} aria-hidden="true" className={editPencilClassName} />
      </button>
      {shownDepth && (
        <span className="mt-0.5 block text-right">
          <DepthPriceLine depth={shownDepth} />
        </span>
      )}
    </>
  );
}

interface MaterialsPhoneRowProps {
  material: MaterialTableRow;
  sourcing: MaterialSourcingMap | undefined;
  pricesReady: boolean;
  nameFor: (typeID: number) => string;
  depth: DepthPrice | undefined;
  /** What building the row saves over buying, when the advice says it is cheaper. */
  savings: number | null;
  editingHave: boolean;
  editingPrice: boolean;
  onEditHave: () => void;
  onStopEditingHave: () => void;
  onEditPrice: () => void;
  onStopEditingPrice: () => void;
  /** Cells the table renders for both layouts, passed in as already-built nodes. */
  name: ReactNode;
  total: ReactNode;
  ownedHint: ReactNode;
  action: ReactNode;
  haveField: ReactNode;
  priceField: (autoFocus: boolean) => ReactNode;
  /** The price field of a built row with an unpriced ingredient — the warning, not a price. */
  unpricedField: ReactNode;
}

/**
 * One phone ledger row, under its section's NEED | HAVE | BUY header: the
 * name and total; the three numbers in the header's columns, Have a
 * number with a pencil you tap to edit; then the row's action on the left and its price
 * (or what a build saves) on the right. No card and no box — rows are told
 * apart by a zebra tint, so the Materials panel is the only frame. A
 * Blueprint row has no numbers line, and an owned one says Owned instead of
 * a total and a price of 0.
 */
export function MaterialsPhoneRow({
  material,
  sourcing,
  pricesReady,
  nameFor,
  depth,
  savings,
  editingHave,
  editingPrice,
  onEditHave,
  onStopEditingHave,
  onEditPrice,
  onStopEditingPrice,
  name,
  total,
  ownedHint,
  action,
  haveField,
  priceField,
  unpricedField,
}: MaterialsPhoneRowProps) {
  const { t } = useTranslation();
  const building = material.subBuilds.length > 0;
  const tier = material.acquisitionTier;
  const ownedBlueprint = tier !== undefined && material.remainingQuantity === 0;
  return (
    <li
      className={cx(
        'grid grid-cols-3 gap-x-1.5 gap-y-1 px-3 py-2 even:bg-white/[0.025]',
        ownedBlueprint && 'opacity-80'
      )}
    >
      <div className="col-span-3 flex items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold">{name}</span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
          {ownedBlueprint ? (
            <span className="text-[0.625rem] leading-5 font-bold tracking-widest text-blueprint-copy uppercase">
              {t('industry.blueprintAcquisitionOwned')}
            </span>
          ) : (
            total
          )}
        </span>
      </div>
      {!tier && (
        <>
          <span className={LEDGER_VALUE}>{formatCount(material.quantity)}</span>
          <span className={LEDGER_VALUE}>
            <PhoneHave
              material={material}
              sourcing={sourcing}
              nameFor={nameFor}
              editing={editingHave}
              onEdit={onEditHave}
              onStopEditing={onStopEditingHave}
              field={haveField}
            />
          </span>
          <span className={cx(LEDGER_VALUE, 'font-semibold')}>
            {formatCount(material.remainingQuantity)}
          </span>
        </>
      )}
      {/* What to do about the row on the left — use what's in the hangar,
          switch build/buy, change the blueprint tier — and on the right its
          price as "@ price", or what building it saves. */}
      <div className="col-span-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3">
          {ownedHint}
          {action}
          {tier && (
            <span className="text-[0.6875rem] text-text-dim">
              {t('industry.blueprintAcquisitionTier', tier)}
            </span>
          )}
        </span>
        {building ? (
          savings !== null ? (
            <span className="ml-auto text-xs text-success tabular-nums">
              {t('industry.errands.saves', { amount: formatIskCompact(savings) })}
            </span>
          ) : (
            material.unpriced && unpricedField
          )
        ) : (
          !ownedBlueprint && (
            <span className="ml-auto text-xs">
              <PhonePrice
                material={material}
                sourcing={sourcing}
                pricesReady={pricesReady}
                nameFor={nameFor}
                depth={depth}
                editing={editingPrice}
                onEdit={onEditPrice}
                onStopEditing={onStopEditingPrice}
                field={priceField}
              />
            </span>
          )
        )}
      </div>
    </li>
  );
}
