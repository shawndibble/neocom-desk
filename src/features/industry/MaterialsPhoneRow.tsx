import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { MaterialSourcingMap } from '@/engine/industry/types';
import { cx } from '@/lib/cx';
import { formatIskCompact, maskIsk } from '@/lib/isk';
import { formatCount } from '@/lib/formatCount';
import { DepthPriceLine } from './DepthPriceLine';
import { EditableValue } from '@/components/ui';
import { whenFocusLeaves } from './focusLeaves';
import { materialRowState } from './materialRow';
import type { MaterialTableRow } from './subBuildPlan';

interface PhonePriceProps {
  material: MaterialTableRow;
  sourcing: MaterialSourcingMap | undefined;
  pricesReady: boolean;
  nameFor: (typeID: number) => string;
  depth: DepthPrice | undefined;
  editing: boolean;
  onEdit: (seed?: string) => void;
  onStopEditing: () => void;
  refocus: boolean;
  onRefocused: () => void;
  field: (autoFocus: boolean) => ReactNode;
}

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
        label={t('industry.editPriceFor', { material: nameFor(material.typeID) })}
        onEdit={onEdit}
        focusOnMount={refocus}
        onFocused={onRefocused}
        className={cx('text-xs', overridden ? 'text-accent' : 'text-text')}
      >
        {t('industry.errands.atPrice', { price: maskIsk(state.unitPrice) })}
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
  savings: number | null;
  editingHave: boolean;
  editingPrice: boolean;
  onEditHave: (seed?: string) => void;
  onStopEditingHave: () => void;
  onEditPrice: (seed?: string) => void;
  onStopEditingPrice: () => void;
  refocusHave: boolean;
  refocusPrice: boolean;
  onRefocused: () => void;
  name: ReactNode;
  total: ReactNode;
  ownedHint: ReactNode;
  action: ReactNode;
  menu?: ReactNode;
  haveField: ReactNode;
  priceField: (autoFocus: boolean) => ReactNode;
  unpricedField: ReactNode;
}

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
  menu,
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
            <span className="text-[0.6875rem] leading-5 font-bold tracking-widest text-blueprint-copy uppercase">
              {t('industry.blueprintAcquisitionOwned')}
            </span>
          ) : (
            total
          )}
          {menu}
        </span>
      </div>

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
            {t(
              tier.copyOnly
                ? 'industry.blueprintAcquisitionTierCopyOnly'
                : 'industry.blueprintAcquisitionTier',
              tier
            )}
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
                label={t('industry.errands.editHaveFor', { material: nameFor(material.typeID) })}
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

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 empty:hidden">
        {ownedHint}
        {action}
      </div>
    </li>
  );
}
