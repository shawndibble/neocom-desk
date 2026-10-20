import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { MultiSelect, type MultiSelectGroup } from '@/components/ui/MultiSelect';
import { TRADE_HUBS } from '@/market/hubs';
import { MAX_COMPARE_REGIONS, toggleCompareRegion } from '@/engine/market/priceHistoryCompare';
import type { MarketRegionEntry } from '@/sde/marketTypes';
import { compareRegionStroke, PRIMARY_REGION_STROKE } from './compareRegionStrokes';

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
      // The region's colour and dash, which its line on the chart carries
      // whether it draws an average or a Buy / Sell pair (those two differ by
      // weight, shown in the chart legend).
      const stroke = slot < 0 ? PRIMARY_REGION_STROKE : compareRegionStroke(slot);
      return (
        <svg width="14" height="8" aria-hidden="true" className="shrink-0">
          <line
            x1="0"
            y1="4"
            x2="14"
            y2="4"
            stroke={stroke.color}
            strokeWidth="2"
            strokeDasharray={stroke.dash}
          />
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
      summary={`${selected.length} / ${MAX_COMPARE_REGIONS}`}
      triggerAriaLabel={t('market.priceHistory.compareButton', {
        count: selected.length,
        max: MAX_COMPARE_REGIONS,
      })}
      className={className}
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
