import { JumpsLink } from '@/features/route/JumpsLink';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckboxSelect,
  FilterBar,
  FilterChip,
  FilterField,
  InfoTooltip,
  TextInput,
  textActionClassName,
  type ActiveFilter,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { HintText } from '@/components/ui/HintText';
import { DEFAULT_JUMP_RANGE } from '@/engine/route/jumpRange';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import { toggleInSet } from '@/lib/sets';
import { SELL_OUTLIER_FACTOR } from '@/engine/market/orderBookDepth';
import { SecurityStatus } from '@/components/SecurityStatus';
import type { CurrentSystemState } from '@/features/route/currentSystem';
import { CurrentSystemPicker, JumpRangeSelect } from '@/features/route/JumpRangeControls';
import { useSystemName } from '@/features/route/useSolarSystems';
import { useIsDesktop } from '@/lib/useIsDesktop';
import type { BrowserFilterValue } from './useBrowserFilters';

function parseMinQuantity(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

function rangeSelectProps(
  draft: BrowserFilterValue,
  setDraft: (next: BrowserFilterValue) => void,
  scopeLabel: string
) {
  return {
    value: draft.jumps,
    onChange: (jumps: BrowserFilterValue['jumps']) => setDraft({ ...draft, jumps }),
    anyLabel: scopeLabel,
    active: draft.jumps !== DEFAULT_JUMP_RANGE,
  };
}

interface BrowserFilterFieldsProps {
  draft: BrowserFilterValue;
  setDraft: (next: BrowserFilterValue) => void;
  regionMode: boolean;
  scopeLabel: string;
  currentSystem: CurrentSystemState;
  showRange: boolean;
  showOrigin: boolean;
}

function BrowserFilterFields({
  draft,
  setDraft,
  regionMode,
  scopeLabel,
  currentSystem,
  showRange,
  showOrigin,
}: BrowserFilterFieldsProps) {
  const { t } = useTranslation();
  const spansStations = regionMode || draft.jumps !== DEFAULT_JUMP_RANGE;
  return (
    <>
      {showRange && (
        <FilterField captionInline label={t('jumpRange.label')}>
          <JumpRangeSelect
            {...rangeSelectProps(draft, setDraft, scopeLabel)}
            className="w-40 max-md:w-full"
          />
        </FilterField>
      )}
      {showOrigin && draft.jumps !== DEFAULT_JUMP_RANGE && (
        <FilterField label={t('jumpRange.label')} stretch={false} hideCaption>
          <CurrentSystemPicker current={currentSystem} />
        </FilterField>
      )}
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
        <FilterField captionInline label={t('market.filterSecurity')}>
          <CheckboxSelect<SpaceKind>
            label={t('market.filterSecurity')}
            size="md"
            className="w-44"
            active={draft.sec.size !== SPACE_KINDS.length}
            options={SPACE_KINDS.map((kind) => ({
              value: kind,
              label: t(`common.spaceOption.${kind}`),
            }))}
            selected={draft.sec}
            onToggle={(kind) => setDraft({ ...draft, sec: toggleInSet(draft.sec, kind) })}
          />
        </FilterField>
      )}
      {spansStations && (
        <FilterField label={t('market.filterNpcOnly')} stretch={false} hideCaption>
          <FilterChip
            label={t('market.filterNpcOnly')}
            size="md"
            selected={draft.npcOnly}
            onToggle={() => setDraft({ ...draft, npcOnly: !draft.npcOnly })}
          />
        </FilterField>
      )}
      <FilterField label={t('market.filterHideBait')} stretch={false} hideCaption>
        <FilterChip
          label={t('market.filterHideBait')}
          tooltip={t('market.filterHideBaitHint', { times: SELL_OUTLIER_FACTOR })}
          size="md"
          selected={draft.hideBait}
          onToggle={() => setDraft({ ...draft, hideBait: !draft.hideBait })}
        />
      </FilterField>
    </>
  );
}

export interface BrowserFilterBarProps {
  value: BrowserFilterValue;
  onChange: (next: BrowserFilterValue) => void;
  active: readonly ActiveFilter<BrowserFilterValue>[];
  regionMode: boolean;
  scopeLabel: string;
  currentSystem: CurrentSystemState;
  search: ReactNode;
  className?: string;
}

export function BrowserFilterBar({
  value,
  onChange,
  active,
  regionMode,
  scopeLabel,
  currentSystem,
  search,
  className,
}: BrowserFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={value}
      onChange={onChange}
      active={active}
      search={search}
      className={className}
      inline={(draft, setDraft) => (
        <div className="flex w-full items-end gap-2">
          <FilterField captionInline label={t('jumpRange.label')}>
            <JumpRangeSelect
              {...rangeSelectProps(draft, setDraft, scopeLabel)}
              className="w-40 shrink-0"
            />
          </FilterField>
          {draft.jumps !== DEFAULT_JUMP_RANGE && (
            <FilterField label={t('jumpRange.currentSystemLabel')} hideCaption>
              <CurrentSystemPicker current={currentSystem} />
            </FilterField>
          )}
        </div>
      )}
      inlinePlacement="below"
    >
      {(draft, setDraft, surface) => (
        <BrowserFilterFields
          showRange={surface === 'sheet'}
          showOrigin={surface === 'sheet'}
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

export type OrderBookScope =
  | { kind: 'range'; jumps: Exclude<BrowserFilterValue['jumps'], 'any'>; stationCount: number }
  | {
      kind: 'station';
      stationName: string;
      systemId: number;
      security: number | null;
      jumpsAway: number | null;
    }
  | { kind: 'region'; regionName: string; stationCount: number };

export interface OrderBookScopeBarProps {
  scope: OrderBookScope;
  filterValue: BrowserFilterValue;
  onFilterChange: (next: BrowserFilterValue) => void;
  active: readonly ActiveFilter<BrowserFilterValue>[];
  regionMode: boolean;
  scopeLabel: string;
  currentSystem: CurrentSystemState;
  note?: string | null;
}

export function OrderBookScopeBar({
  scope,
  filterValue,
  onFilterChange,
  active,
  regionMode,
  scopeLabel,
  currentSystem,
  note,
}: OrderBookScopeBarProps) {
  const { t } = useTranslation();
  const originName = useSystemName(currentSystem.systemId);
  const ranged = scope.kind === 'range';
  const finderBeside = useIsDesktop();

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
            <button
              type="button"
              onClick={() => onFilterChange({ ...filterValue, jumps: DEFAULT_JUMP_RANGE })}
              className={textActionClassName()}
            >
              {t('market.scope.clearRange')}
            </button>
          </>
        );
      case 'station':
        return (
          <>
            <HintText content={scope.stationName} className="min-w-0 truncate font-semibold">
              {scope.stationName}
            </HintText>
            {scope.security !== null && <SecurityStatus security={scope.security} />}
            {scope.jumpsAway !== null && originName !== null && (
              <span className="whitespace-nowrap text-text-dim">
                <JumpsLink systemId={scope.systemId}>
                  {t('market.scope.jumpsAway', { count: scope.jumpsAway, system: originName })}
                </JumpsLink>
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
        <p
          className={cx(
            'm-0 flex min-w-0 flex-1 items-center gap-2',
            !ranged && 'md:min-w-[18rem]'
          )}
        >
          <Icon.Location aria-hidden className={cx('shrink-0', ranged && 'text-accent')} />
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">{summary}</span>
          {note && <InfoTooltip label={t('market.scope.noteLabel')} content={note} />}
        </p>
        <FilterBar
          value={filterValue}
          onChange={onFilterChange}
          active={finderBeside ? active.filter((filter) => !filter.inline) : active}
          title={t('market.scope.sheetTitle')}
          pointerSurface="popover"
        >
          {(draft, setDraft) => (
            <BrowserFilterFields
              showRange={!finderBeside}
              showOrigin={!finderBeside}
              draft={draft}
              setDraft={setDraft}
              regionMode={regionMode}
              scopeLabel={scopeLabel}
              currentSystem={currentSystem}
            />
          )}
        </FilterBar>
      </div>
    </section>
  );
}
