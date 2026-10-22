/**
 * The Opportunities panel's header controls (issue #4253): the Ranked / Owned
 * view picker, the Character filter and the "Use my stock" filter. Desktop
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
import { MOSTLY_COVERED_PCT } from './opportunityMetrics';

export type OpportunitiesView = 'ranked' | 'owned';
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
}: {
  view: OpportunitiesView;
  onViewChange: (next: OpportunitiesView) => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 items-center pl-2">
      <h2 className="sr-only">{t('industry.opportunitiesTitle')}</h2>
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
  // The segmented control on desktop gets one-word labels so the three fit on
  // the title's line at 1280; the phone select has the room for the full ones.
  const stockOptions = [
    { value: 'any' as const, label: t('industry.opportunitiesStockAny') },
    {
      value: 'mostly' as const,
      label: isDesktop
        ? t('industry.opportunitiesStockMostlyShort', { pct: MOSTLY_COVERED_PCT })
        : t('industry.opportunitiesStockMostly', { pct: MOSTLY_COVERED_PCT }),
    },
    {
      value: 'full' as const,
      label: isDesktop
        ? t('industry.opportunitiesStockFullShort')
        : t('industry.opportunitiesStockFull'),
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
        className="min-w-0 flex-1"
      >
        <SelectValue />
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

/**
 * The panel's `meta` slot: view toggle (desktop) and stock filter. The
 * Character filter is the Industry page's own, in its `PageHeader`.
 */
export function OpportunitiesFilterBar({
  view,
  onViewChange,
  stockFilter,
  onStockFilterChange,
}: {
  view: OpportunitiesView;
  onViewChange: (next: OpportunitiesView) => void;
  stockFilter: OpportunitiesStockFilter;
  onStockFilterChange: (next: OpportunitiesStockFilter) => void;
}) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const stockFilterControl = view === 'ranked' && (
    <StockFilterControl value={stockFilter} onChange={onStockFilterChange} />
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
        ]}
      />
      {stockFilterControl}
    </span>
  ) : (
    // A second header row on a phone, so the stock select gets the full width
    // instead of colliding with the view picker and Refresh. None at all on
    // All owned, which has no stock filter.
    stockFilterControl && (
      <span className="flex items-center gap-2 max-md:basis-full">{stockFilterControl}</span>
    )
  );
}
