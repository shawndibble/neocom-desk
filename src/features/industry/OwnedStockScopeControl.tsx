import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FilterChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import {
  collectStockLocations,
  ownedStockLocationKey,
  type DetectedOwnedStockMap,
  type OwnedStockLocation,
  type OwnedStockScope,
} from '@/engine/industry/ownedStock';
import type { OwnedStockDetection } from './ownedStockDetection';

interface OwnedStockScopeControlProps {
  /** Absent, or `{ mode: 'everywhere' }`, means every placement counts — today's only behavior before this control existed. */
  scope: OwnedStockScope | undefined;
  /** The plan's full, unfiltered detected stock — the source for the location picker's candidate list. */
  detectedStock: DetectedOwnedStockMap;
  detection: OwnedStockDetection;
  /** `undefined` clears the field back to the "everywhere" default rather than storing it explicitly. */
  onChange: (scope: OwnedStockScope | undefined) => void;
  /**
   * Rendered inline at the end of the label-and-select line. The "use all"
   * bulk fill lives here rather than in the Materials panel's own toolbar: it
   * spends exactly the stock this control scopes, and two rows apart the two
   * did not read as one thing. A slot rather than a prop pair, so this
   * component still knows nothing about sourcing patches.
   */
  action?: ReactNode;
}

/**
 * Plan-level control: which locations count toward this plan's "use all"
 * owned-stock totals. "Everywhere" is the default; "Selected locations"
 * narrows the offer to a chosen subset, derived from the plan's already-
 * computed detected stock so there is nothing new to fetch.
 *
 * Belongs at the head of the Materials panel, above the table whose owned
 * column it governs — not in the plan's Location & market settings, where it
 * reads as another thing about where the job runs rather than about which of
 * your hangars the table may count.
 */
export function OwnedStockScopeControl({
  scope,
  detectedStock,
  detection,
  onChange,
  action,
}: OwnedStockScopeControlProps) {
  const { t } = useTranslation();
  const locations = useMemo(() => collectStockLocations(detectedStock), [detectedStock]);
  const mode = scope?.mode ?? 'everywhere';
  const selected = useMemo(() => (scope?.mode === 'selected' ? scope.locations : []), [scope]);
  const selectedKeys = useMemo(() => new Set(selected.map(ownedStockLocationKey)), [selected]);

  function labelFor(location: OwnedStockLocation): string {
    return t('industry.detectedOwnedPlacement', {
      character: detection.characterNameFor(location.characterId),
      location: detection.locationLabelFor(location),
    });
  }

  function toggle(location: OwnedStockLocation) {
    const key = ownedStockLocationKey(location);
    const next = selectedKeys.has(key)
      ? selected.filter((l) => ownedStockLocationKey(l) !== key)
      : [...selected, location];
    onChange({ mode: 'selected', locations: next });
  }

  // Two children, not one wrapper: the label-and-select line, and the chip
  // list as a block of its own beneath. Splitting them is what stops the
  // line's height from jumping when "Selected" is chosen.
  //
  // The label sits inline with the select from `sm` up and stacks above it
  // below that — the same breakpoint the plan's own settings grid folds at, so
  // a narrow screen never has to choose between a cramped label and a select
  // too short to read an option in. The action stays welded to the select at
  // both widths.
  return (
    <>
      <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-2">
        <span className="whitespace-nowrap">{t('industry.ownedStockScopeLabel')}</span>
        {/* Select and action share a row at every width: the bulk fill spends
            exactly the stock this select scopes, and stacking them apart on a
            narrow screen is what made the two read as unrelated. */}
        <div className="flex items-center gap-2">
          <Select
            value={mode}
            onValueChange={(value) => {
              // Pre-selecting every currently known location when a player first
              // switches to "Selected" leaves the count unchanged at the moment
              // of the switch — flipping the toggle must not silently zero out
              // "use all" before the player has chosen anything to exclude.
              onChange(
                value === 'selected'
                  ? { mode: 'selected', locations: selected.length > 0 ? selected : locations }
                  : undefined
              );
            }}
          >
            <SelectTrigger aria-label={t('industry.ownedStockScopeLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="everywhere">{t('industry.ownedStockScopeEverywhere')}</SelectItem>
              <SelectItem value="selected">{t('industry.ownedStockScopeSelected')}</SelectItem>
            </SelectContent>
          </Select>
          {action}
        </div>
      </div>
      {mode === 'selected' &&
        (locations.length === 0 ? (
          <span className="text-xs text-text-dim">{t('industry.ownedStockScopeNoLocations')}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {locations.map((location) => (
              <FilterChip
                key={ownedStockLocationKey(location)}
                label={labelFor(location)}
                selected={selectedKeys.has(ownedStockLocationKey(location))}
                onToggle={() => toggle(location)}
              />
            ))}
          </div>
        ))}
    </>
  );
}
