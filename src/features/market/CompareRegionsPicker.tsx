import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import * as Icon from '@/components/ui/icons';
import { MultiSelect, type MultiSelectGroup } from '@/components/ui/MultiSelect';
import { TRADE_HUBS } from '@/market/hubs';
import { MAX_COMPARE_REGIONS, toggleCompareRegion } from '@/engine/market/priceHistoryCompare';
import type { MarketRegionEntry } from '@/sde/marketTypes';
import { compareRegionStroke } from './compareRegionStrokes';

interface CompareRegionsPickerProps {
  /** The order book's region — already the main line, so not offered. */
  primaryRegionId: number;
  /** Picked regions, in pick order. */
  selected: readonly number[];
  onChange: (next: number[]) => void;
  regions: readonly MarketRegionEntry[];
  className?: string;
  /**
   * The picker chooses the regions outright, the primary one included (the
   * Item Detail's Market tab, which has no Browser scope to supply one):
   * nothing is left out of the list, and the last pick cannot be cleared.
   */
  required?: boolean;
}

/**
 * The Price History tab's "Compare regions" control. Trade-hub regions are
 * listed first as the obvious picks, then every other market region. A pick
 * past `MAX_COMPARE_REGIONS` is ignored (`toggleCompareRegion`) and the
 * popover says why; a picked region's swatch is its line on the chart.
 */
export function CompareRegionsPicker({
  primaryRegionId,
  selected,
  onChange,
  regions,
  className,
  required = false,
}: CompareRegionsPickerProps) {
  const { t } = useTranslation();
  const groups = useMemo<MultiSelectGroup<number>[]>(() => {
    const swatch = (id: number) => {
      // With `required` the first pick is the primary region: the chart's main
      // colour (accent), with no comparison stroke of its own.
      const index = selected.indexOf(id);
      if (index < 0) return undefined;
      const slot = index - (required ? 1 : 0);
      const color = slot < 0 ? 'var(--color-accent)' : compareRegionStroke(slot).color;
      // A block of the region's colour, not a line: a region draws a solid
      // Sell and a dashed Buy line, or a dashed average where it has no open
      // series, and the chart legend shows which. The colour is the one fact
      // that holds for all of them.
      return (
        <svg width="10" height="10" aria-hidden="true" className="shrink-0">
          <rect width="10" height="10" rx="2" fill={color} />
        </svg>
      );
    };
    const hubRegionIds = new Set(TRADE_HUBS.map((hub) => hub.regionId));
    const hubs = TRADE_HUBS.filter((hub) => hub.regionId !== primaryRegionId).map((hub) => ({
      id: hub.regionId,
      label: t('market.priceHistory.compareHubOption', {
        region: hub.regionName,
        hub: hub.systemName,
      }),
      swatch: swatch(hub.regionId),
    }));
    const others = regions
      .filter((region) => region.id !== primaryRegionId && !hubRegionIds.has(region.id))
      .map((region) => ({ id: region.id, label: region.name, swatch: swatch(region.id) }));
    return [
      { label: t('market.priceHistory.compareHubsGroup'), options: hubs },
      { label: t('market.priceHistory.compareAllGroup'), options: others },
    ];
  }, [t, regions, primaryRegionId, selected, required]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <MultiSelect
      label={t('market.priceHistory.compareRegions')}
      trigger={
        <Button
          size="md"
          className={className}
          aria-label={t('market.priceHistory.compareButton', {
            count: selected.length,
            max: MAX_COMPARE_REGIONS,
          })}
        >
          <span aria-hidden="true">{t('market.priceHistory.compareRegions')}</span>
          <span aria-hidden="true" className="text-text-dim tabular-nums">
            {selected.length} / {MAX_COMPARE_REGIONS}
          </span>
          <Icon.Expanded aria-hidden="true" className="text-text-dim" />
        </Button>
      }
      groups={groups}
      selected={selectedSet}
      onToggle={(id) => {
        const next = toggleCompareRegion(selected, id);
        if (required && next.length === 0) return;
        onChange(next);
      }}
      searchPlaceholder={t('common.searchRegions')}
      noResultsLabel={t('common.noRegionMatches')}
      extraContent={(close) => (
        <div className="flex items-center justify-between gap-2 border-b border-line p-1 pl-2 text-xs text-text-dim">
          <span>{t('market.priceHistory.compareLimit', { max: MAX_COMPARE_REGIONS })}</span>
          {selected.length > 0 && !required && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange([]);
                close();
              }}
            >
              {t('market.priceHistory.compareClear')}
            </Button>
          )}
        </div>
      )}
    />
  );
}
