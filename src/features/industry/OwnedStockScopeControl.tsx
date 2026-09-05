import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip, NativeSelect } from '@/components/ui';
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
}

/**
 * Plan-level control for issue #454: which locations count toward this
 * plan's "use detected" owned-stock totals. "Everywhere" is the default and
 * matches every behavior before this control existed; "Selected locations"
 * narrows the offer to a chosen subset, derived from the plan's already-
 * computed detected stock so there is nothing new to fetch.
 *
 * Rendered at the head of the Materials panel, above the table whose owned
 * column it governs. It sat in the Location & market settings for a while and
 * read there as a third thing about *where the job runs*, next to Facility and
 * Trade hub, when it is really about which of your hangars the table may count.
 */
export function OwnedStockScopeControl({
  scope,
  detectedStock,
  detection,
  onChange,
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

  // Two grid children, not one: a plain select the width of one cell, and a
  // chip list that needs the whole row. Splitting them is what stops the row's
  // height from jumping when "Selected" is chosen, and it means the caller
  // supplies the grid rather than this deciding its own width.
  return (
    <>
      <div className="flex flex-col gap-1 text-xs">
        <label htmlFor="build-plan-owned-stock-scope">{t('industry.ownedStockScopeLabel')}</label>
        <NativeSelect
          id="build-plan-owned-stock-scope"
          value={mode}
          onChange={(e) => {
            const nextMode = e.target.value;
            // Pre-selecting every currently known location when a player first
            // switches to "Selected" leaves the count unchanged at the moment
            // of the switch — flipping the toggle must not silently zero out
            // "use detected" before the player has chosen anything to exclude.
            onChange(
              nextMode === 'selected'
                ? { mode: 'selected', locations: selected.length > 0 ? selected : locations }
                : undefined
            );
          }}
        >
          <option value="everywhere">{t('industry.ownedStockScopeEverywhere')}</option>
          <option value="selected">{t('industry.ownedStockScopeSelected')}</option>
        </NativeSelect>
      </div>
      {mode === 'selected' &&
        (locations.length === 0 ? (
          <span className="col-span-full text-xs text-text-dim">
            {t('industry.ownedStockScopeNoLocations')}
          </span>
        ) : (
          <div className="col-span-full flex flex-wrap gap-1.5">
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
