import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckboxSelect,
  FilterBar,
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
import { toggleFilterMember } from '@/lib/multiSelectFilter';
import type { TradeHub } from '@/market/hubs';
import type { PriceBasis } from './priceBasis';
import { PriceBasisSelect } from './PriceBasisSelect';
import { TradeHubSelect } from './TradeHubSelect';
import {
  MIN_SELLS_PER_DAY_OPTIONS,
  lpLandingActiveFilters,
  type LpLandingFilters,
  type MinSellsPerDay,
} from './lpLanding';
import type { LpLandingOption } from './useLpStoreLanding';

/** The URL's empty category list is the shared multi-select's `all`. */
function toggleCategory(
  chosen: readonly number[],
  options: readonly LpLandingOption[],
  id: number
): readonly number[] {
  const next = toggleFilterMember(
    chosen.length === 0 ? 'all' : new Set(chosen),
    id,
    options.map((option) => option.id)
  );
  return next === 'all' ? [] : [...next];
}

const SHOW_ONLY_KEYS = ['mineOnly', 'affordableOnly', 'noTurnIns', 'hideFactionWarfare'] as const;
type ShowOnlyKey = (typeof SHOW_ONLY_KEYS)[number];

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
  /** Stores the Character holds LP with; 0 disables the chips that need a balance, null while unread. */
  heldStores: number | null;
  columnPicker: ReactNode;
}) {
  const { t } = useTranslation();
  const noLp = heldStores === 0;
  return (
    <FilterBar
      value={value}
      onChange={onChange}
      active={lpLandingActiveFilters(value, t, { factions, categories })}
      rowAlign="end"
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
          <FilterField captionInline label={t('loyaltyStore.hubLabel')}>
            <TradeHubSelect
              value={draft.hubId}
              onValueChange={(hubId) => setDraft({ ...draft, hubId })}
            />
          </FilterField>
          <FilterField captionInline label={t('loyaltyStore.priceBasisLabel')}>
            <PriceBasisSelect
              value={draft.priceBasis}
              onValueChange={(priceBasis) => setDraft({ ...draft, priceBasis })}
            />
          </FilterField>
          <FilterField captionInline label={t('loyaltyStore.landing.factionLabel')}>
            <Select
              value={String(draft.faction)}
              onValueChange={(next) =>
                setDraft({
                  ...draft,
                  faction: next === 'all' || next === 'none' ? next : Number(next),
                })
              }
            >
              <SelectTrigger
                aria-label={t('loyaltyStore.landing.factionLabel')}
                active={draft.faction !== 'all'}
              >
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
          <FilterField captionInline label={t('jumpRange.label')}>
            <JumpRangeSelect
              value={draft.range}
              active={draft.range !== 'any'}
              onChange={(range) => setDraft({ ...draft, range })}
            />
          </FilterField>
          <FilterField captionInline label={t('loyaltyStore.landing.minSellsLabel')}>
            <Select
              value={String(draft.minSellsPerDay)}
              onValueChange={(next) =>
                setDraft({ ...draft, minSellsPerDay: Number(next) as MinSellsPerDay })
              }
            >
              <SelectTrigger
                aria-label={t('loyaltyStore.landing.minSellsLabel')}
                active={draft.minSellsPerDay !== 0}
              >
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
            <FilterField captionInline label={t('loyaltyStore.landing.categoryLabel')}>
              <CheckboxSelect
                label={t('loyaltyStore.landing.categoryLabel')}
                size="md"
                active={draft.categories.length > 0}
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                selected={
                  new Set(
                    draft.categories.length === 0 ? categories.map((c) => c.id) : draft.categories
                  )
                }
                onToggle={(id) =>
                  setDraft({
                    ...draft,
                    categories: toggleCategory(draft.categories, categories, id),
                  })
                }
              />
            </FilterField>
          )}
          <FilterField captionInline label={t('loyaltyStore.landing.showOnlyLabel')}>
            <CheckboxSelect<ShowOnlyKey>
              label={t('loyaltyStore.landing.showOnlyLabel')}
              size="md"
              active={SHOW_ONLY_KEYS.some((key) => draft[key])}
              noneLabel={t('loyaltyStore.landing.showOnlyAny')}
              options={[
                {
                  value: 'mineOnly',
                  label: t('loyaltyStore.landing.mineOnly'),
                  description: noLp ? t('loyaltyStore.landing.noLpHeld') : undefined,
                  disabled: noLp && !draft.mineOnly,
                },
                {
                  value: 'affordableOnly',
                  label: t('loyaltyStore.landing.affordable'),
                  description: noLp
                    ? t('loyaltyStore.landing.noLpHeld')
                    : t('loyaltyStore.landing.affordableHelp'),
                  disabled: noLp && !draft.affordableOnly,
                },
                {
                  value: 'noTurnIns',
                  label: t('loyaltyStore.landing.noTurnIns'),
                  description: t('loyaltyStore.landing.noTurnInsHelp'),
                },
                {
                  value: 'hideFactionWarfare',
                  label: t('loyaltyStore.landing.hideFactionWarfare'),
                  description: t('loyaltyStore.landing.hideFactionWarfareHelp'),
                },
              ]}
              selected={new Set(SHOW_ONLY_KEYS.filter((key) => draft[key]))}
              onToggle={(key) => setDraft({ ...draft, [key]: !draft[key] })}
            />
          </FilterField>
        </>
      )}
    </FilterBar>
  );
}
