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
  /**
   * The Corp Assets toggle (issue #798), rendered on the same line as the
   * label and Select rather than a row of its own — it governs what feeds
   * this very scope, so a line between the two read as unrelated. Omitted
   * entirely by the Build Group's own owned-stock overlay, which has no
   * per-plan Corp Assets choice.
   */
  corpAssetsToggle?: ReactNode;
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
 *
 * The picker is one nested tree (issue #2941): stations, with corp hangars and
 * containers under each. A popover on desktop; a bottom sheet with Apply and
 * Cancel on a phone, where a tree edited live under the thumb is easy to
 * disturb.
 */
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
              // Seeded on open, not in an effect: a cancelled draft must not resurrect itself.
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

  // Two children, not one wrapper: the label-and-select line, and the picker
  // as a block of its own beneath. Splitting them is what stops the line's
  // height from jumping when "Selected" is chosen.
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
        {/* Select, Corp Assets toggle and action share a row at every width:
            the bulk fill spends exactly the stock this select scopes, and
            stacking them apart on a narrow screen is what made the two read
            as unrelated. `flex-wrap` lets a phone-width row fold rather than
            squeeze three controls plus a label onto one line. */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={mode}
            onValueChange={(value) => {
              // Pre-selecting every currently known location when a player first
              // switches to "Selected" leaves the count unchanged at the moment
              // of the switch — flipping the toggle must not silently zero out
              // "use all" before the player has chosen anything to exclude.
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
            >
              <OwnedStockScopeTree
                stations={stations}
                scope={draft}
                onChange={setDraft}
                labelFor={labelFor}
              />
              <div className="sticky bottom-0 -mx-3 -mb-[calc(0.75rem_+_env(safe-area-inset-bottom))] mt-3 flex gap-2 border-t border-line bg-panel px-3 pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
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
            </Modal>
          </>
        ) : (
          <Popover>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent align="start" className="max-h-80 w-80 overflow-y-auto p-2">
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
