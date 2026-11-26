import { useTranslation } from 'react-i18next';
import { Button, FilterChip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import type { DetectedOwnedStockMap, OwnedStockScope } from '@/engine/industry/ownedStock';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';
import type { OwnedStockDetection } from './ownedStockDetection';

interface PlanOwnedStockControlProps {
  scope: OwnedStockScope | undefined;
  includeCorpAssets: boolean;
  corpAvailable: boolean;
  detectedStock: DetectedOwnedStockMap;
  detection: OwnedStockDetection;
  onScopeChange: (scope: OwnedStockScope | undefined) => void;
  onIncludeCorpAssetsChange: (include: boolean) => void;
  onFillAll: () => void;
  onClearAll: () => void;
}

export function PlanOwnedStockControl({
  scope,
  includeCorpAssets,
  corpAvailable,
  detectedStock,
  detection,
  onScopeChange,
  onIncludeCorpAssetsChange,
  onFillAll,
  onClearAll,
}: PlanOwnedStockControlProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center text-xs">
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" aria-haspopup="dialog">
            {t('industry.ownedControl.label')}
            <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={t('industry.ownedControl.label')}
          className="w-80 space-y-3 p-3"
        >
          <OwnedStockScopeControl
            scope={scope}
            detectedStock={detectedStock}
            detection={detection}
            onChange={onScopeChange}
          />
          <div className="space-y-1">
            <FilterChip
              label={t('industry.includeCorpAssets')}
              selected={includeCorpAssets}
              disabled={!corpAvailable}
              onToggle={() => onIncludeCorpAssetsChange(!includeCorpAssets)}
            />
            <p className="text-xs text-text-dim">
              {corpAvailable
                ? t('industry.includeCorpAssetsTooltip')
                : t('industry.includeCorpAssetsUnavailable')}
            </p>
          </div>
          <div className="flex items-center gap-2 border-t border-line pt-3 text-xs">
            <span className="flex-1 text-text-dim">{t('industry.ownedControl.fill')}</span>
            <Button size="sm" onClick={onFillAll}>
              {t('industry.useAllOwned')}
            </Button>
            <Button size="sm" onClick={onClearAll}>
              {t('industry.useNoneOwned')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
