/**
 * Where the Market Browser's Order Book is looking, said above the book itself
 * — "Within 5 jumps of Badivefi · 6 stations", or the hub station and how far
 * it is — with the same filters the finder's funnel holds, editable in place.
 *
 * The filters still live beside the item search (the range is set before
 * searching, scope decision 20260929-204125); this bar mirrors them on the
 * results side, where a reader looks for "why is the book showing this", and
 * is the only way to reach them on a phone once an item is open (the finder
 * column is hidden then). Both bars read and write one `BrowserFilterValue`,
 * so they can never disagree.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterBar, FilterChip, FilterField, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { DEFAULT_JUMP_RANGE } from '@/engine/route/jumpRange';
import { SPACE_KINDS } from '@/engine/space';
import { securityStatusColor } from '@/engine/securityStatus';
import type { CurrentSystemState } from '@/features/route/currentSystem';
import { CurrentSystemPicker, JumpRangeSelect } from '@/features/route/JumpRangeControls';
import { useSystemName } from '@/features/route/useSolarSystems';
import type { BrowserFilterValue } from './useOrderBookOrchestration';

/** A Min quantity box's text as a count; blank or junk is no minimum. */
function parseMinQuantity(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

interface BrowserFilterFieldsProps {
  draft: BrowserFilterValue;
  setDraft: (next: BrowserFilterValue) => void;
  /** Security and NPC stations only need a book of many stations: Region mode, or a set Jump Range. */
  regionMode: boolean;
  /** The header's hub or region: what the book reads while no Jump Range is set. */
  scopeLabel: string;
  currentSystem: CurrentSystemState;
}

/**
 * The order book's filter fields, written once for both bars and both
 * surfaces (the pointer-width box and the phone sheet's draft).
 */
function BrowserFilterFields({
  draft,
  setDraft,
  regionMode,
  scopeLabel,
  currentSystem,
}: BrowserFilterFieldsProps) {
  const { t } = useTranslation();
  const spansStations = regionMode || draft.jumps !== DEFAULT_JUMP_RANGE;
  return (
    <>
      {/* Keyed on the draft, so the picker and the many-station filters
          appear as soon as a distance is picked, before it is applied. */}
      <FilterField label={t('jumpRange.label')}>
        <div className="flex flex-wrap items-center gap-2">
          <JumpRangeSelect
            value={draft.jumps}
            onChange={(jumps) => setDraft({ ...draft, jumps })}
            anyLabel={scopeLabel}
            className="w-40 max-md:w-full"
          />
          {draft.jumps !== DEFAULT_JUMP_RANGE && <CurrentSystemPicker current={currentSystem} />}
        </div>
      </FilterField>
      <FilterField label={t('market.filterMinQuantity')}>
        <TextInput
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={t('market.filterMinQuantity')}
          placeholder={t('market.filterMinQuantity')}
          className="w-32"
          value={draft.minQty === 0 ? '' : String(draft.minQty)}
          onChange={(event) => setDraft({ ...draft, minQty: parseMinQuantity(event.target.value) })}
        />
      </FilterField>
      {spansStations && (
        <div
          role="group"
          aria-label={t('market.filterSecurity')}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-text-dim">{t('market.filterSecurity')}</span>
          {SPACE_KINDS.map((kind) => (
            <FilterChip
              key={kind}
              label={t(`common.spaceOption.${kind}`)}
              selected={draft.sec.has(kind)}
              onToggle={() => {
                const next = new Set(draft.sec);
                if (next.has(kind)) next.delete(kind);
                else next.add(kind);
                setDraft({ ...draft, sec: next });
              }}
            />
          ))}
        </div>
      )}
      {spansStations && (
        <FilterChip
          label={t('market.filterNpcOnly')}
          selected={draft.npcOnly}
          onToggle={() => setDraft({ ...draft, npcOnly: !draft.npcOnly })}
        />
      )}
    </>
  );
}

export interface BrowserFilterBarProps {
  value: BrowserFilterValue;
  onChange: (next: BrowserFilterValue) => void;
  activeCount: number;
  regionMode: boolean;
  scopeLabel: string;
  currentSystem: CurrentSystemState;
  /** The item search: the funnel sits at the end of its line rather than a row of its own. */
  search: ReactNode;
  className?: string;
}

/**
 * The order book's filters behind a funnel beside the item search, like the
 * other search pages (BPC Sourcing, Courier). They sit in the finder column
 * rather than over the book: the range is where to look, set before searching,
 * not a property of one item.
 */
export function BrowserFilterBar({
  value,
  onChange,
  activeCount,
  regionMode,
  scopeLabel,
  currentSystem,
  search,
  className,
}: BrowserFilterBarProps) {
  return (
    <FilterBar
      value={value}
      onChange={onChange}
      activeCount={activeCount}
      search={search}
      className={className}
    >
      {(draft, setDraft) => (
        <BrowserFilterFields
          draft={draft}
          setDraft={setDraft}
          regionMode={regionMode}
          scopeLabel={scopeLabel}
          currentSystem={currentSystem}
        />
      )}
    </FilterBar>
  );
}

/** What the book is reading, in the words the bar says it with. */
export type OrderBookScope =
  /** A measurable Jump Range: every station in reach of the Current System. */
  | { kind: 'range'; jumps: Exclude<BrowserFilterValue['jumps'], 'any'>; stationCount: number }
  /** Trade Hub mode with no range: the hub's one station. */
  | { kind: 'station'; stationName: string; security: number | null; jumpsAway: number | null }
  /** Region mode with no range: every station in the picked region, or in every region. */
  | { kind: 'region'; regionName: string; stationCount: number };

export interface OrderBookScopeBarProps {
  scope: OrderBookScope;
  filterValue: BrowserFilterValue;
  onFilterChange: (next: BrowserFilterValue) => void;
  activeCount: number;
  regionMode: boolean;
  scopeLabel: string;
  currentSystem: CurrentSystemState;
  /** What still reads the header's hub or region while the book reaches further. */
  note?: string | null;
}

export function OrderBookScopeBar({
  scope,
  filterValue,
  onFilterChange,
  activeCount,
  regionMode,
  scopeLabel,
  currentSystem,
  note,
}: OrderBookScopeBarProps) {
  const { t } = useTranslation();
  const originName = useSystemName(currentSystem.systemId);
  const ranged = scope.kind === 'range';

  const summary = (() => {
    switch (scope.kind) {
      case 'range':
        return (
          <>
            <span className="font-semibold text-accent">
              {scope.jumps === 'system'
                ? t('market.scope.inSystem', { system: originName ?? '…' })
                : t('market.scope.within', {
                    distance: t(`jumpRange.option.${scope.jumps}`),
                    system: originName ?? '…',
                  })}
            </span>
            <span className="text-text-dim">
              {t('market.scope.stations', { count: scope.stationCount })}
            </span>
            {/* The range is the one filter here that changes what the book
                is; taking it off is one click, not a trip into the funnel. */}
            <button
              type="button"
              onClick={() => onFilterChange({ ...filterValue, jumps: DEFAULT_JUMP_RANGE })}
              className="text-accent underline underline-offset-2 hover:text-text max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
            >
              {t('market.scope.clearRange')}
            </button>
          </>
        );
      case 'station':
        return (
          <>
            <span className="min-w-0 truncate font-semibold" title={scope.stationName}>
              {scope.stationName}
            </span>
            {scope.security !== null && (
              <span
                className="font-semibold tabular-nums"
                style={{ color: securityStatusColor(scope.security) }}
              >
                {scope.security.toFixed(1)}
              </span>
            )}
            {scope.jumpsAway !== null && originName !== null && (
              <span className="whitespace-nowrap text-text-dim">
                {t('market.scope.jumpsAway', { count: scope.jumpsAway, system: originName })}
              </span>
            )}
          </>
        );
      case 'region':
        return (
          <>
            <span className="font-semibold">{scope.regionName}</span>
            <span className="text-text-dim">
              {t('market.scope.stations', { count: scope.stationCount })}
            </span>
          </>
        );
    }
  })();

  return (
    <section
      aria-label={t('market.scope.label')}
      className={cx(
        'flex flex-col gap-1 border px-3 py-2 text-xs',
        ranged ? 'border-accent bg-accent/10' : 'border-line bg-panel-2'
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="m-0 flex min-w-0 flex-1 items-center gap-2 sm:min-w-[18rem]">
          <Icon.Location aria-hidden className={cx('shrink-0', ranged && 'text-accent')} />
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">{summary}</span>
        </p>
        {/* The one control a pilot changes most, in reach without a click —
            not on a phone, whose sheet holds it with the rest. */}
        <span className="flex items-center gap-2 max-sm:hidden">
          <JumpRangeSelect
            value={filterValue.jumps}
            onChange={(jumps) => onFilterChange({ ...filterValue, jumps })}
            anyLabel={scopeLabel}
            className="w-44"
          />
          {filterValue.jumps !== DEFAULT_JUMP_RANGE && (
            <CurrentSystemPicker current={currentSystem} />
          )}
        </span>
        <FilterBar
          value={filterValue}
          onChange={onFilterChange}
          activeCount={activeCount}
          title={t('market.scope.sheetTitle')}
          pointerSurface="popover"
        >
          {(draft, setDraft) => (
            <BrowserFilterFields
              draft={draft}
              setDraft={setDraft}
              regionMode={regionMode}
              scopeLabel={scopeLabel}
              currentSystem={currentSystem}
            />
          )}
        </FilterBar>
      </div>
      {note && <p className="m-0 text-[0.6875rem] text-text-dim">{note}</p>}
    </section>
  );
}
