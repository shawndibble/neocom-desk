import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { MaterialSourcingMap } from '@/engine/industry/types';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { maskNumber } from '@/lib/numberMask';
import { formatCount } from '@/lib/formatCount';
import { DepthPriceLine } from './DepthPriceLine';
import { EditableValue } from './EditableValue';
import { whenFocusLeaves } from './focusLeaves';
import { materialRowState } from './materialRow';
import type { MaterialTableRow } from './subBuildPlan';

interface PhonePriceProps {
  material: MaterialTableRow;
  sourcing: MaterialSourcingMap | undefined;
  pricesReady: boolean;
  nameFor: (typeID: number) => string;
  /** The row's Depth Price walk; absent for a built row or one priced at the lowest sell. */
  depth: DepthPrice | undefined;
  editing: boolean;
  onEdit: (seed?: string) => void;
  onStopEditing: () => void;
  /** Enter or Escape just closed the field: take focus back. */
  refocus: boolean;
  onRefocused: () => void;
  /** The price field itself, shown while editing; `autoFocus` is true once the player asked to edit. */
  field: (autoFocus: boolean) => ReactNode;
}

/**
 * The card's price: "@ 4 ISK" with a faint pencil, which becomes the field
 * when tapped and goes back to text once focus leaves it. A row with no price
 * yet stays the field, since there is no number to show.
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
  refocus,
  onRefocused,
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
      <EditableValue
        label={t('industry.priceFor', { material: nameFor(material.typeID) })}
        onEdit={onEdit}
        focusOnMount={refocus}
        onFocused={onRefocused}
        className={cx('text-xs', overridden ? 'text-accent' : 'text-text')}
      >
        {t('industry.errands.atPrice', { price: maskNumber(state.unitPrice) })}
        {overridden && (
          <span className="ml-1.5 text-[0.6875rem]">{t('industry.priceSourceOverride')}</span>
        )}
      </EditableValue>
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
  onEditHave: (seed?: string) => void;
  onStopEditingHave: () => void;
  onEditPrice: (seed?: string) => void;
  onStopEditingPrice: () => void;
  /** Enter or Escape just closed that field: its value takes focus back. */
  refocusHave: boolean;
  refocusPrice: boolean;
  onRefocused: () => void;
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
 * One phone card, read as the errand it is rather than as a row of unlabelled
 * columns: the name and what the line costs; then what to do — "Buy 317,000
 * @ 4 ISK", "Build", or nothing for stock already owned; then, small, how
 * that number came about — "Need 320,000 · Have 3,000". Every number carries
 * its own word, so no section needs a column header above its cards. Have and
 * price are edited in place (a faint pencil, §6c). No card box — rows are told
 * apart by a zebra tint, so the Materials panel is the only frame.
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
  refocusHave,
  refocusPrice,
  onRefocused,
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
  const fullyOwned = !tier && !building && material.remainingQuantity === 0;
  const owned = sourcing?.[material.typeID]?.ownedQuantity ?? 0;
  const price = (
    <span className="ml-auto text-right">
      <PhonePrice
        material={material}
        sourcing={sourcing}
        pricesReady={pricesReady}
        nameFor={nameFor}
        depth={depth}
        editing={editingPrice}
        onEdit={onEditPrice}
        onStopEditing={onStopEditingPrice}
        refocus={refocusPrice}
        onRefocused={onRefocused}
        field={priceField}
      />
    </span>
  );
  return (
    <li
      className={cx(
        'flex flex-col gap-1 px-3 py-2 even:bg-white/[0.025]',
        ownedBlueprint && 'opacity-80'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold">{name}</span>
        <span className="flex shrink-0 items-baseline gap-1 text-sm font-semibold tabular-nums">
          {ownedBlueprint ? (
            <span className="text-[0.625rem] leading-5 font-bold tracking-widest text-blueprint-copy uppercase">
              {t('industry.blueprintAcquisitionOwned')}
            </span>
          ) : (
            total
          )}
        </span>
      </div>

      {/* What to do about it. */}
      {building ? (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-success">{t('industry.errands.buildColumn')}</span>
          {savings !== null ? (
            <span className="text-success tabular-nums">
              {t('industry.errands.saves', { amount: formatIskCompact(savings) })}
            </span>
          ) : (
            material.unpriced && unpricedField
          )}
        </div>
      ) : tier ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <span className="text-[0.6875rem] text-text-dim">
            {t('industry.blueprintAcquisitionTier', tier)}
          </span>
          {!ownedBlueprint && price}
        </div>
      ) : (
        !fullyOwned && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="text-text-dim tabular-nums">
              <Trans
                i18nKey="industry.errands.buyQuantity"
                values={{ quantity: formatCount(material.remainingQuantity) }}
                components={{ b: <span className="font-semibold text-text" /> }}
              />
            </span>
            {price}
          </div>
        )
      )}

      {/* How that number came about. */}
      {!tier && (
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-dim tabular-nums">
          <span>
            {t('industry.errands.needQuantity', { quantity: formatCount(material.quantity) })}
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            {t('industry.errands.haveColumn')}
            {editingHave ? (
              <span className="w-28" onBlur={whenFocusLeaves(onStopEditingHave)}>
                {haveField}
              </span>
            ) : (
              <EditableValue
                label={t('industry.errands.haveFor', { material: nameFor(material.typeID) })}
                onEdit={onEditHave}
                focusOnMount={refocusHave}
                onFocused={onRefocused}
                className={owned > 0 ? 'text-accent' : 'text-text-dim'}
              >
                {formatCount(owned)}
              </EditableValue>
            )}
          </span>
        </div>
      )}

      {/* Use what's in the hangar, switch build/buy, change the blueprint tier. */}
      {/* `empty:hidden`: both nodes may render nothing, and an empty line would still take a gap. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 empty:hidden">
        {ownedHint}
        {action}
      </div>
    </li>
  );
}
