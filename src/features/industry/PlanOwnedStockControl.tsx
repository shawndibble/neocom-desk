import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip } from '@/components/ui';
import { fieldBaseClassName, fieldSizeClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import type { DetectedOwnedStockMap, OwnedStockScope } from '@/engine/industry/ownedStock';
import { cx } from '@/lib/cx';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';
import type { OwnedStockDetection } from './ownedStockDetection';

interface PlanOwnedStockControlProps {
  /** Absent means every placement counts. */
  scope: OwnedStockScope | undefined;
  includeCorpAssets: boolean;
  /** False when the Character can't read their corporation's assets; the chip says why. */
  corpAvailable: boolean;
  /** The plan's full, unfiltered detected stock, for the location picker. */
  detectedStock: DetectedOwnedStockMap;
  detection: OwnedStockDetection;
  onScopeChange: (scope: OwnedStockScope | undefined) => void;
  onIncludeCorpAssetsChange: (include: boolean) => void;
  /** Use all / Use none: fill every Have from what was found, or clear them. */
  onFillAll: () => void;
  onClearAll: () => void;
}

/**
 * Which owned stock the Materials table counts, behind one Owned trigger:
 * read once per plan, not on every visit, so it is a summary at rest and the
 * scope, corp assets and bulk fill in a popover. §6c: a trigger that opens a
 * popover is field chrome with a trailing caret.
 */
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
  const labelId = useId();
  const valueId = useId();
  const scopeLabel =
    scope?.mode === 'selected'
      ? t('industry.ownedStockScopeSelected')
      : t('industry.ownedStockScopeEverywhere');
  return (
    <div className="flex items-center gap-2 text-xs">
      <span id={labelId} className="whitespace-nowrap">
        {t('industry.ownedControl.label')}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-labelledby={`${labelId} ${valueId}`}
            className={cx(
              fieldBaseClassName,
              fieldSizeClassName.sm,
              'inline-flex items-center gap-2'
            )}
          >
            <span id={valueId}>
              {includeCorpAssets
                ? t('industry.ownedControl.withCorp', { scope: scopeLabel })
                : scopeLabel}
            </span>
            <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          </button>
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
