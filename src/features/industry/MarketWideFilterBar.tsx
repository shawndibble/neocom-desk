import { useTranslation } from 'react-i18next';
import {
  CheckboxSelect,
  FilterBar,
  FilterChip,
  FilterField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { BLUEPRINT_SOURCES } from '@/engine/industry/blueprintObtainability';
import { PRODUCT_CATEGORIES, PRODUCT_TIERS } from '@/engine/industry/marketWideFilters';
import { RARELY_SOLD_PER_DAY } from '@/engine/industry/marketWideSanity';
import { toggleInSet } from '@/lib/sets';
import {
  BUILD_COST_CAPS,
  activeFilterCount,
  type BuildCostCap,
  type MarketWideFilterState,
} from './marketWideFilter';
import { SALES_SHARE_OPTIONS } from './salesSharePref';

interface MarketWideFilterBarProps {
  filter: MarketWideFilterState;
  onChange: (next: MarketWideFilterState) => void;
  /** Rows no Character on the account can build, shown as the skill chip's count. */
  gatedCount: number;
}

/**
 * The funnel sits in the title bar beside Scan, at Scan's own size, in every
 * state: below `md` it opens `FilterBar`'s sheet, with a pointer a popover
 * off the funnel — a box unfolding beneath it would open inside the bar.
 */
export function MarketWideFilterBar({ filter, onChange, gatedCount }: MarketWideFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeFilterCount(filter)}
      triggerSize="sm"
      pointerSurface="popover"
    >
      {(draft, setDraft) => (
        // Two controls per row in the phone sheet so it stays short; the
        // chips sit together on the last row. `lg:contents` leaves the popover as it was.
        <div className="grid w-full grid-cols-2 gap-3 lg:contents">
          <FilterField label={t('industry.marketOpportunitiesFilters.maxBuildCost')}>
            <Select
              value={draft.maxBuildCost}
              onValueChange={(value) => setDraft({ ...draft, maxBuildCost: value as BuildCostCap })}
            >
              <SelectTrigger
                size="sm"
                aria-label={t('industry.marketOpportunitiesFilters.maxBuildCost')}
                className="w-52"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUILD_COST_CAPS.map((cap) => (
                  <SelectItem key={cap} value={cap}>
                    {t(`industry.marketOpportunitiesFilters.buildCostCaps.${cap}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterMultiSelect
            label={t('industry.marketOpportunitiesFilters.tier')}
            members={PRODUCT_TIERS}
            selected={draft.tiers}
            labelFor={(tier) => t(`industry.marketOpportunitiesFilters.tiers.${tier}`)}
            onToggle={(tier) => setDraft({ ...draft, tiers: toggleInSet(draft.tiers, tier) })}
          />
          <FilterMultiSelect
            label={t('industry.marketOpportunitiesFilters.category')}
            members={PRODUCT_CATEGORIES}
            selected={draft.categories}
            labelFor={(category) => t(`industry.marketOpportunitiesFilters.categories.${category}`)}
            onToggle={(category) =>
              setDraft({ ...draft, categories: toggleInSet(draft.categories, category) })
            }
          />
          <FilterMultiSelect
            label={t('industry.marketOpportunitiesBlueprintSource')}
            members={BLUEPRINT_SOURCES}
            selected={draft.sources}
            labelFor={(source) => t(`industry.marketOpportunitiesBlueprintSources.${source}`)}
            onToggle={(source) =>
              setDraft({ ...draft, sources: toggleInSet(draft.sources, source) })
            }
          />
          <div
            role="group"
            aria-label={t('industry.marketOpportunitiesFilters.skills')}
            className="flex flex-wrap items-center gap-2 max-lg:order-1"
          >
            <span className="text-text-dim">{t('industry.marketOpportunitiesFilters.skills')}</span>
            <FilterChip
              label={t('industry.skillGateFilterChip')}
              selected={draft.hideSkillGated}
              onToggle={() => setDraft({ ...draft, hideSkillGated: !draft.hideSkillGated })}
              {...(gatedCount > 0 && {
                count: gatedCount,
                countLabel: t('industry.skillGateFilterChipCount', { count: gatedCount }),
              })}
            />
          </div>
          <FilterField label={t('industry.marketOpportunitiesFilters.salesShare')}>
            <Select
              value={draft.salesShare}
              onValueChange={(value) => setDraft({ ...draft, salesShare: value })}
            >
              <SelectTrigger
                size="sm"
                aria-label={t('industry.marketOpportunitiesFilters.salesShare')}
                className="w-52"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SALES_SHARE_OPTIONS.map((share) => (
                  <SelectItem key={share} value={share}>
                    {t('industry.marketOpportunitiesFilters.salesShareOption', { share })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <div
            role="group"
            aria-label={t('industry.marketOpportunitiesFilters.sales')}
            className="flex flex-wrap items-center gap-2 max-lg:order-1"
          >
            <span className="text-text-dim">{t('industry.marketOpportunitiesFilters.sales')}</span>
            <FilterChip
              label={t('industry.marketOpportunitiesFilters.hideRarelySold', {
                limit: RARELY_SOLD_PER_DAY,
              })}
              selected={draft.hideRarelySold}
              onToggle={() => setDraft({ ...draft, hideRarelySold: !draft.hideRarelySold })}
            />
          </div>
        </div>
      )}
    </FilterBar>
  );
}

/** One labelled multi-select dropdown over a closed set — BPC Sourcing's filter groups, reused. */
function FilterMultiSelect<V extends string>({
  label,
  members,
  selected,
  labelFor,
  onToggle,
}: {
  label: string;
  members: readonly V[];
  selected: ReadonlySet<V>;
  labelFor: (member: V) => string;
  onToggle: (member: V) => void;
}) {
  return (
    <FilterField label={label}>
      <CheckboxSelect
        label={label}
        className="w-44"
        options={members.map((member) => ({ value: member, label: labelFor(member) }))}
        selected={selected}
        onToggle={onToggle}
      />
    </FilterField>
  );
}
