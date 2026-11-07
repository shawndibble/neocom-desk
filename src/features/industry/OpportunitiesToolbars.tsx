/**
 * The Opportunities panel's header controls (issue #4253): the Ranked / Owned
 * view picker, the Character filter, the Manufacturing / Reactions filter
 * (issue #5990) and the "Use my stock" filter. Desktop
 * lays them out as segmented controls beside the title; below `lg` the view
 * picker is the title itself.
 */
import { useTranslation } from 'react-i18next';
import {
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { activityFilterOptions, MOSTLY_COVERED_PCT } from './opportunityMetrics';
import type { OpportunitiesActivityFilter } from './opportunitiesUrl';

export type OpportunitiesView = 'ranked' | 'owned' | 'corp';
export type OpportunitiesStockFilter = 'any' | 'mostly' | 'full';

/**
 * Below `lg` the view picker *is* the panel's title: a bordered select
 * reading "Ranked builds" / "Owned blueprints", so the title, the view, the
 * Character filter and the actions all fit one line on a phone. The panel
 * mounts this only there; desktop keeps the plain title and segmented control.
 */
export function OpportunitiesViewPicker({
  view,
  onViewChange,
  showCorpProjects,
}: {
  view: OpportunitiesView;
  onViewChange: (next: OpportunitiesView) => void;
  /** The Corp projects view exists for this Character (the hide rule); it is absent otherwise. */
  showCorpProjects: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 items-center pl-2">
      <h2 className="sr-only">{t('industry.opportunitiesTableLabel')}</h2>
      <Select value={view} onValueChange={(next) => onViewChange(next as OpportunitiesView)}>
        <SelectTrigger
          size="sm"
          aria-label={t('industry.opportunitiesView')}
          className="min-w-0 text-[0.6875rem] font-semibold tracking-widest uppercase"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ranked">{t('industry.opportunitiesViewRankedTitle')}</SelectItem>
          <SelectItem value="owned">{t('industry.opportunitiesViewOwnedTitle')}</SelectItem>
          {showCorpProjects && (
            <SelectItem value="corp">{t('industry.opportunitiesViewCorpTitle')}</SelectItem>
          )}
        </SelectContent>
      </Select>
    </span>
  );
}

function StockFilterControl({
  value,
  onChange,
}: {
  value: OpportunitiesStockFilter;
  onChange: (next: OpportunitiesStockFilter) => void;
}) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  // Full wording in the desktop segmented control and the phone's open list;
  // the phone's closed select shows the short word so the title row fits one line.
  const stockOptions = [
    {
      value: 'any' as const,
      label: t('industry.opportunitiesStockAny'),
      short: t('industry.opportunitiesStockAny'),
    },
    {
      value: 'mostly' as const,
      label: t('industry.opportunitiesStockMostly', { pct: MOSTLY_COVERED_PCT }),
      short: t('industry.opportunitiesStockMostlyShort', { pct: MOSTLY_COVERED_PCT }),
    },
    {
      value: 'full' as const,
      label: t('industry.opportunitiesStockFull'),
      short: t('industry.opportunitiesStockFullShort'),
    },
  ];
  return isDesktop ? (
    <SegmentedControl
      label={t('industry.opportunitiesUseMyStock')}
      size="sm"
      value={value}
      onChange={onChange}
      options={stockOptions}
    />
  ) : (
    <Select value={value} onValueChange={(next) => onChange(next as OpportunitiesStockFilter)}>
      <SelectTrigger
        size="sm"
        aria-label={t('industry.opportunitiesUseMyStock')}
        className="min-w-0"
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="text-text-dim" aria-hidden="true">
            {t('industry.opportunitiesStockPrefix')}
          </span>
          <SelectValue>{stockOptions.find((o) => o.value === value)?.short}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent>
        {stockOptions.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActivityFilterControl({
  value,
  onChange,
}: {
  value: OpportunitiesActivityFilter;
  onChange: (next: OpportunitiesActivityFilter) => void;
}) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const options = activityFilterOptions(t);
  const label = t('industry.ownedBlueprintsActivityLabel');
  return isDesktop ? (
    <SegmentedControl label={label} size="sm" value={value} onChange={onChange} options={options} />
  ) : (
    <Select value={value} onValueChange={(next) => onChange(next as OpportunitiesActivityFilter)}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The panel's `meta` slot: view toggle (desktop), activity and stock filters. The
 * Character filter is the Industry page's own, in its `PageHeader`.
 */
export function OpportunitiesFilterBar({
  view,
  onViewChange,
  stockFilter,
  onStockFilterChange,
  activityFilter,
  onActivityFilterChange,
  showActivityFilter,
  showCorpProjects,
}: {
  view: OpportunitiesView;
  onViewChange: (next: OpportunitiesView) => void;
  stockFilter: OpportunitiesStockFilter;
  onStockFilterChange: (next: OpportunitiesStockFilter) => void;
  activityFilter: OpportunitiesActivityFilter;
  onActivityFilterChange: (next: OpportunitiesActivityFilter) => void;
  /** Ranked holds a reaction formula (or the filter is off its default): with none, the filter would choose nothing. */
  showActivityFilter: boolean;
  /** The Corp projects view exists for this Character (the hide rule); it is absent otherwise. */
  showCorpProjects: boolean;
}) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const rankedFilters = view === 'ranked' && (
    <>
      {showActivityFilter && (
        <ActivityFilterControl value={activityFilter} onChange={onActivityFilterChange} />
      )}
      <StockFilterControl value={stockFilter} onChange={onStockFilterChange} />
    </>
  );
  return isDesktop ? (
    <span className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label={t('industry.opportunitiesView')}
        size="sm"
        value={view}
        onChange={onViewChange}
        options={[
          { value: 'ranked', label: t('industry.opportunitiesViewRanked') },
          { value: 'owned', label: t('industry.opportunitiesViewOwned') },
          ...(showCorpProjects
            ? [{ value: 'corp' as const, label: t('industry.opportunitiesViewCorp') }]
            : []),
        ]}
      />
      {rankedFilters}
    </span>
  ) : (
    // One row with the view picker and the actions on a phone; none on All owned.
    rankedFilters || null
  );
}
