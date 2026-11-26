import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import {
  collectStockLocations,
  type DetectedOwnedStockMap,
  type OwnedStockLocation,
  type OwnedStockScope,
} from '@/engine/industry/ownedStock';
import { buildScopeTree, stationState } from '@/engine/industry/ownedStockScopeTree';
import { useIsNarrow } from '@/lib/useIsNarrow';
import type { OwnedStockDetection } from './ownedStockDetection';
import { OwnedStockScopeTree } from './OwnedStockScopeTree';

interface OwnedStockScopeControlProps {
  scope: OwnedStockScope | undefined;
  detectedStock: DetectedOwnedStockMap;
  detection: OwnedStockDetection;
  onChange: (scope: OwnedStockScope | undefined) => void;
  action?: ReactNode;
  corpAssetsToggle?: ReactNode;
}

export function OwnedStockScopeControl({
  scope,
  detectedStock,
  detection,
  onChange,
  action,
  corpAssetsToggle,
}: OwnedStockScopeControlProps) {
  const { t } = useTranslation();
  const isNarrow = useIsNarrow();
  const locations = useMemo(() => collectStockLocations(detectedStock), [detectedStock]);
  const stations = useMemo(() => buildScopeTree(detectedStock), [detectedStock]);
  const mode = scope?.mode ?? 'everywhere';
  const selectedLocations = scope?.mode === 'selected' ? scope.locations : [];
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<OwnedStockScope | undefined>(scope);

  function labelFor(location: OwnedStockLocation): string {
    const owner =
      location.corporationId !== undefined
        ? detection.corporationNameFor(location.corporationId)
        : detection.characterNameFor(location.characterId);
    return t('industry.detectedOwnedPlacement', {
      character: owner,
      location: detection.locationLabelFor(location),
    });
  }

  const pickedCount = stations.filter((s) => stationState(scope, s) !== 'empty').length;
  const trigger = (
    <Button
      size="sm"
      aria-haspopup="dialog"
      {...(isNarrow
        ? {
            onClick: () => {
              setDraft(scope);
              setSheetOpen(true);
            },
          }
        : {})}
    >
      {t('industry.ownedStockScopeSelectedCount', { count: pickedCount })}
    </Button>
  );
  const closeSheet = () => setSheetOpen(false);

  return (
    <>
      <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-2">
        <span className="whitespace-nowrap">{t('industry.ownedStockScopeLabel')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={mode}
            onValueChange={(value) => {
              onChange(
                value === 'selected'
                  ? {
                      mode: 'selected',
                      locations: selectedLocations.length > 0 ? selectedLocations : locations,
                    }
                  : undefined
              );
            }}
          >
            <SelectTrigger size="sm" aria-label={t('industry.ownedStockScopeLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="everywhere">{t('industry.ownedStockScopeEverywhere')}</SelectItem>
              <SelectItem value="selected">{t('industry.ownedStockScopeSelected')}</SelectItem>
            </SelectContent>
          </Select>
          {corpAssetsToggle}
          {action}
        </div>
      </div>
      {mode === 'selected' &&
        (stations.length === 0 ? (
          <span className="text-xs text-text-dim">{t('industry.ownedStockScopeNoLocations')}</span>
        ) : isNarrow ? (
          <>
            {trigger}
            <Modal
              open={sheetOpen}
              onClose={closeSheet}
              title={t('industry.ownedStockScopeLabel')}
              placement="sheet"
              footer={
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={closeSheet}>
                    {t('filters.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => {
                      onChange(draft);
                      closeSheet();
                    }}
                  >
                    {t('filters.apply')}
                  </Button>
                </div>
              }
            >
              <OwnedStockScopeTree
                stations={stations}
                scope={draft}
                onChange={setDraft}
                labelFor={labelFor}
              />
            </Modal>
          </>
        ) : (
          <Popover>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label={t('industry.ownedStockScopeLabel')}
              className="max-h-80 w-80 overflow-y-auto p-2"
            >
              <OwnedStockScopeTree
                stations={stations}
                scope={scope}
                onChange={onChange}
                labelFor={labelFor}
              />
            </PopoverContent>
          </Popover>
        ))}
    </>
  );
}
