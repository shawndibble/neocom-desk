import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckboxSelect,
  FilterBar,
  FilterChip,
  FilterField,
  SearchInput,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { JumpRangeSelect } from '@/features/route/JumpRangeControls';
import type { TradeHub } from '@/market/hubs';
import type { PriceBasis } from './priceBasis';
import { PriceBasisSelect } from './PriceBasisSelect';
import { TradeHubSelect } from './TradeHubSelect';
import {
  MIN_SELLS_PER_DAY_OPTIONS,
  lpLandingActiveFilterCount,
  type LpLandingFilters,
  type MinSellsPerDay,
} from './lpLanding';
import type { LpLandingOption } from './useLpStoreLanding';

/** Every category is ticked while the filter is off (an empty list). */
function selectedCategories(
  chosen: readonly number[],
  options: readonly LpLandingOption[]
): ReadonlySet<number> {
  return new Set(chosen.length === 0 ? options.map((option) => option.id) : chosen);
}

/**
 * Ticking the last one back clears the filter (an empty list). The last ticked
 * category stays ticked: no category at all would only empty the table.
 */
function toggleCategory(
  chosen: readonly number[],
  options: readonly LpLandingOption[],
  id: number
): readonly number[] {
  const next = new Set(selectedCategories(chosen, options));
  if (next.has(id)) next.delete(id);
  else next.add(id);
  if (next.size === options.length) return [];
  return next.size === 0 ? chosen : [...next];
}

export type LpLandingView = 'stores' | 'offers';

/** The filters plus the two persisted settings the numbers are priced at, edited together. */
export interface LpLandingFilterValue extends LpLandingFilters {
  hubId: TradeHub['id'];
  priceBasis: PriceBasis;
}

/**
 * The landing's one filter row (DESIGN.md §4b): the view switch and the search
 * box, the column picker for the view on screen, and the funnel. The view
 * switch sits in the search slot (the Ship Tree precedent): it changes what
 * the box searches, not what the filters narrow.
 */
export function LpLandingFilterBar({
  view,
  onViewChange,
  query,
  onQueryChange,
  value,
  onChange,
  factions,
  categories,
  heldStores,
  columnPicker,
}: {
  view: LpLandingView;
  onViewChange: (view: LpLandingView) => void;
  query: string;
  onQueryChange: (query: string) => void;
  value: LpLandingFilterValue;
  onChange: (next: LpLandingFilterValue) => void;
  factions: readonly LpLandingOption[];
  categories: readonly LpLandingOption[];
  /** Stores the Character holds LP with; 0 disables the chips that need a balance. */
  heldStores: number;
  columnPicker: ReactNode;
}) {
  const { t } = useTranslation();
  const noLp = heldStores === 0;
  return (
    <FilterBar
      value={value}
      onChange={onChange}
      activeCount={lpLandingActiveFilterCount(value)}
      rowAlign="end"
      triggerLabel
      search={
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <SegmentedControl
            label={t('loyaltyStore.landing.viewLabel')}
            options={[
              { value: 'stores', label: t('loyaltyStore.landing.viewStores') },
              { value: 'offers', label: t('loyaltyStore.landing.viewOffers') },
            ]}
            value={view}
            onChange={onViewChange}
            className="max-sm:basis-full max-sm:*:flex-1"
          />
          <SearchInput
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t(
              view === 'stores'
                ? 'loyaltyStore.landing.searchStores'
                : 'loyaltyStore.landing.searchOffers'
            )}
            aria-label={t('loyaltyStore.landing.searchLabel')}
            className="min-w-32 flex-1"
          />
        </div>
      }
      actions={columnPicker}
    >
      {(draft, setDraft) => (
        <>
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
          <FilterField label={t('loyaltyStore.landing.factionLabel')}>
            <Select
              value={String(draft.faction)}
              onValueChange={(next) =>
                setDraft({
                  ...draft,
                  faction: next === 'all' || next === 'none' ? next : Number(next),
                })
              }
            >
              <SelectTrigger aria-label={t('loyaltyStore.landing.factionLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('loyaltyStore.landing.factionAll')}</SelectItem>
                {factions.map((faction) => (
                  <SelectItem key={faction.id} value={String(faction.id)}>
                    {faction.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">{t('loyaltyStore.landing.noFaction')}</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t('jumpRange.label')}>
            <JumpRangeSelect
              value={draft.range}
              onChange={(range) => setDraft({ ...draft, range })}
            />
          </FilterField>
          <FilterField label={t('loyaltyStore.landing.minSellsLabel')}>
            <Select
              value={String(draft.minSellsPerDay)}
              onValueChange={(next) =>
                setDraft({ ...draft, minSellsPerDay: Number(next) as MinSellsPerDay })
              }
            >
              <SelectTrigger aria-label={t('loyaltyStore.landing.minSellsLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MIN_SELLS_PER_DAY_OPTIONS.map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count === 0
                      ? t('loyaltyStore.landing.minSellsAny')
                      : t('loyaltyStore.landing.minSellsPerDay', { count })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          {categories.length > 0 && (
            <FilterField label={t('loyaltyStore.landing.categoryLabel')}>
              <CheckboxSelect
                label={t('loyaltyStore.landing.categoryLabel')}
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                selected={selectedCategories(draft.categories, categories)}
                onToggle={(id) =>
                  setDraft({
                    ...draft,
                    categories: toggleCategory(draft.categories, categories, id),
                  })
                }
              />
            </FilterField>
          )}
          {/* `md:contents`: inline the chips join the row; in the sheet they wrap under one caption. */}
          <FilterField label={t('loyaltyStore.landing.showOnlyLabel')} stretch={false}>
            <div className="flex flex-wrap gap-2 md:contents">
              <FilterChip
                label={t('loyaltyStore.landing.mineOnly')}
                selected={draft.mineOnly}
                onToggle={() => setDraft({ ...draft, mineOnly: !draft.mineOnly })}
                count={noLp ? undefined : heldStores}
                countLabel={t('loyaltyStore.landing.mineOnlyCount')}
                disabled={noLp && !draft.mineOnly}
                tooltip={noLp ? t('loyaltyStore.landing.noLpHeld') : undefined}
                size="md"
              />
              <FilterChip
                label={t('loyaltyStore.landing.affordable')}
                selected={draft.affordableOnly}
                onToggle={() => setDraft({ ...draft, affordableOnly: !draft.affordableOnly })}
                disabled={noLp && !draft.affordableOnly}
                tooltip={
                  noLp
                    ? t('loyaltyStore.landing.noLpHeld')
                    : t('loyaltyStore.landing.affordableHelp')
                }
                size="md"
              />
              <FilterChip
                label={t('loyaltyStore.landing.noTurnIns')}
                selected={draft.noTurnIns}
                onToggle={() => setDraft({ ...draft, noTurnIns: !draft.noTurnIns })}
                tooltip={t('loyaltyStore.landing.noTurnInsHelp')}
                size="md"
              />
              <FilterChip
                label={t('loyaltyStore.landing.hideFactionWarfare')}
                selected={draft.hideFactionWarfare}
                onToggle={() =>
                  setDraft({ ...draft, hideFactionWarfare: !draft.hideFactionWarfare })
                }
                tooltip={t('loyaltyStore.landing.hideFactionWarfareHelp')}
                size="md"
              />
            </div>
          </FilterField>
        </>
      )}
    </FilterBar>
  );
}
