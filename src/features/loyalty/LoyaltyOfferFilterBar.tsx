import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ColumnPickerMenu,
  FilterBar,
  FilterChip,
  FilterField,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type DataTableColumn,
} from '@/components/ui';
import {
  LOYALTY_STORE_OFFERS_COLUMN_IDS,
  type LoyaltyStoreOffersColumnId,
} from '@/features/loyalty/loyaltyStoreColumns';
import type { LpBasis } from '@/features/loyalty/lpBasis';
import type { PriceBasis } from '@/features/loyalty/priceBasis';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import type { useColumnVisibility } from '@/lib/columnVisibility';
import { TradeHubSelect } from '@/features/loyalty/TradeHubSelect';
import { PriceBasisSelect } from '@/features/loyalty/PriceBasisSelect';
import type { TradeHub } from '@/market/hubs';

export interface LoyaltyOfferFilterValue {
  hubId: TradeHub['id'];
  priceBasis: PriceBasis;
  lpBasis: LpBasis;
  affordableOnly: boolean;
  blueprintsOnly: boolean;
}

/** The LP store page's filter row: search, the hub/basis/affordable/blueprint draft, and the column picker. */
export function LoyaltyOfferFilterBar({
  value,
  onChange,
  search,
  onSearchChange,
  affordableCount,
  columnVisibility,
  columnsById,
}: {
  value: LoyaltyOfferFilterValue;
  onChange: (next: LoyaltyOfferFilterValue) => void;
  search: string;
  onSearchChange: (search: string) => void;
  affordableCount: number;
  columnVisibility: ReturnType<typeof useColumnVisibility<LoyaltyStoreOffersColumnId>>;
  columnsById: Record<LoyaltyStoreOffersColumnId, DataTableColumn<LoyaltyOfferRow>>;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={value}
      onChange={onChange}
      activeCount={(value.affordableOnly ? 1 : 0) + (value.blueprintsOnly ? 1 : 0)}
      search={
        <SearchInput
          placeholder={t('loyaltyStore.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-w-40 flex-1"
        />
      }
      actions={
        <ColumnPickerMenu
          available={LOYALTY_STORE_OFFERS_COLUMN_IDS}
          visible={columnVisibility.visible}
          columnsById={columnsById}
          onToggle={columnVisibility.toggle}
          buttonLabel={t('common.columnsButton')}
          menuTitle={t('common.columnsMenuTitle')}
          onReset={columnVisibility.reset}
          resetLabel={t('common.resetColumns')}
        />
      }
    >
      {(draft, setDraft) => (
        <>
          {/* Radix, to match the revenue-basis select beside it: side by side,
    two selects that open into different-looking lists read as a seam. */}
          <FilterField label={t('loyaltyStore.hubLabel')}>
            <TradeHubSelect
              value={draft.hubId}
              onValueChange={(hubId) => setDraft({ ...draft, hubId })}
            />
          </FilterField>
          <FilterField label={t('loyaltyStore.priceBasisLabel')}>
            <PriceBasisSelect
              value={draft.priceBasis}
              onValueChange={(priceBasis) => setDraft({ ...draft, priceBasis })}
            />
          </FilterField>
          <FilterField label={t('loyaltyStore.lpBasisLabel')}>
            <Select
              value={draft.lpBasis}
              onValueChange={(value) => setDraft({ ...draft, lpBasis: value as LpBasis })}
            >
              <SelectTrigger aria-label={t('loyaltyStore.lpBasisLabel')}>
                <SelectValue>
                  {t(
                    draft.lpBasis === 'concord'
                      ? 'loyaltyStore.lpBasisConcord'
                      : 'loyaltyStore.lpBasisLp'
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lp">{t('loyaltyStore.lpBasisLp')}</SelectItem>
                <SelectItem value="concord">{t('loyaltyStore.lpBasisConcord')}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterChip
            label={t('loyaltyStore.affordableFilter')}
            selected={draft.affordableOnly}
            onToggle={() => setDraft({ ...draft, affordableOnly: !draft.affordableOnly })}
            count={affordableCount}
            size="md"
          />
          <FilterChip
            label={t('loyaltyStore.blueprintsFilter')}
            selected={draft.blueprintsOnly}
            onToggle={() => setDraft({ ...draft, blueprintsOnly: !draft.blueprintsOnly })}
            size="md"
          />
        </>
      )}
    </FilterBar>
  );
}
