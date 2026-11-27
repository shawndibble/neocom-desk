import { fixed1 } from '@/lib/fixedFormat';
import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { type ReactElement, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RENAME_PLACE_STATE } from './renamePlaceState';
import { NicknamedName } from '@/features/assets/PlaceName';
import {
  InfoTooltip,
  IskAmount,
  RowActionsMenu,
  RowMoreActions,
  Tooltip,
  TypeIcon,
} from '@/components/ui';
import type { AskEstimateFigure } from '@/features/assets/assetAskFigure';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { useLiftAfterHoldGuard } from '@/components/ui/liftAfterHold';
import { ItemInfoLink } from '@/features/entities';
import { formatUnitVolume } from '@/lib/volume';
import { securityStatusColor } from '@/engine/securityStatus';
import { formatBadge } from './assetBrowserFormat';
import { PlaceRowMenuItems } from './PlaceRowMenuItems';
import { placeMenuActions } from './placeRowMenu';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { PinState } from '@/features/assets/stationPins';
import type { SelectionState } from '@/features/assets/assetSelection';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { PlaceJumpsLink } from '@/features/route/JumpsLink';
import { SelectionCheckbox } from '@/features/character/SelectionCheckbox';
import type { BlueprintKind } from '@/engine/blueprintKind';
import type { Translate } from '@/lib/translate';
import type { DataTableSort } from '@/components/ui';
import type { LevelSortColumn } from './assetLevelSort';

const rowCaretClassName =
  'shrink-0 text-text-faint group-hover:text-accent group-focus-visible:text-accent';

interface SecurityValueProps {
  security: number | null | undefined;
}

export function SecurityValue({ security }: SecurityValueProps) {
  if (security === null || security === undefined) return null;
  const value = fixed1(security);
  return (
    <span
      className="shrink-0 text-[0.6875rem] font-semibold tabular-nums"
      style={{ color: securityStatusColor(security) }}
    >
      {value}
    </span>
  );
}

interface JumpsAwayTextProps {
  result: JumpsAwayResult | undefined;
  t: Translate;
  locationId?: number;
  preference?: RoutePreferenceKind | null;
  linkClassName?: string;
}

export function JumpsAwayText({
  result,
  t,
  locationId,
  preference,
  linkClassName,
}: JumpsAwayTextProps) {
  if (!result) return null;
  if (result.kind === 'known') {
    const text = t('assets.jumpsAway.value', { count: result.jumps });
    return locationId === undefined ? (
      <span className="tabular-nums">{text}</span>
    ) : (
      <PlaceJumpsLink
        locationId={locationId}
        preference={preference}
        className={cx('tabular-nums', linkClassName)}
      >
        {text}
      </PlaceJumpsLink>
    );
  }
  return (
    <Tooltip content={t(`assets.jumpsAway.unknownReason.${result.reason}`)}>
      <span className="pointer-events-auto relative z-10 tabular-nums">
        <span aria-hidden="true">{t('assets.jumpsAway.unknown')}</span>
        <span className="sr-only">{t(`assets.jumpsAway.unknownReason.${result.reason}`)}</span>
      </span>
    </Tooltip>
  );
}

interface CharacterBadgeProps {
  characterName: string;
}

export function CharacterBadge({ characterName }: CharacterBadgeProps) {
  return (
    <span className="ml-1.5 shrink-0 rounded-xs bg-panel-2 px-1 py-0.5 text-[0.6875rem] text-text-dim">
      {characterName}
    </span>
  );
}

interface BlueprintBadgeProps {
  kind: BlueprintKind;
  t: Translate;
}

const BLUEPRINT_BADGE: Record<BlueprintKind, { label: string; name: string; className: string }> = {
  original: {
    label: 'assets.blueprintBadge.original.label',
    name: 'assets.blueprintBadge.original.name',
    className: 'text-accent',
  },
  copy: {
    label: 'assets.blueprintBadge.copy.label',
    name: 'assets.blueprintBadge.copy.name',
    className: 'text-blueprint-copy',
  },
};

export function BlueprintBadge({ kind, t }: BlueprintBadgeProps) {
  const badge = BLUEPRINT_BADGE[kind];
  return (
    <span
      className={cx(
        'ml-1.5 shrink-0 rounded-xs bg-panel-2 px-1 py-0.5 text-[0.6875rem] font-semibold',
        badge.className
      )}
    >
      <span aria-hidden="true">{t(badge.label)}</span>
      <span className="sr-only">{t(badge.name)}</span>
    </span>
  );
}

interface LocationRowProps {
  href: string;
  label: string;
  nickname?: string;
  locationId: number;
  security: number | null | undefined;
  jumpsAway: JumpsAwayResult | undefined;
  itemCount: number;
  estimatedValue: number;
  pinState: PinState;
  onTogglePin: () => void;
  unresolvedParent?: boolean;
  showPin?: boolean;
  selectMode: boolean;
  selectionState: SelectionState;
  onToggleSelection: () => void;
  t: Translate;
}

export function LocationRow({
  href,
  label,
  nickname,
  locationId,
  security,
  jumpsAway,
  itemCount,
  estimatedValue,
  pinState,
  onTogglePin,
  unresolvedParent = false,
  showPin = true,
  selectMode,
  selectionState,
  onToggleSelection,
  t,
}: LocationRowProps) {
  const actions = placeMenuActions({
    kind: 'station',
    pinnable: showPin,
    renamable: showPin,
    resolved: !unresolvedParent,
  });
  const navigate = useNavigate();
  const pinned = pinState !== 'unpinned';
  const row = (
    <div
      className={cx(
        'relative flex items-center gap-2 border-b border-line pr-2 pl-3',
        rowInteractiveClassName
      )}
    >
      {selectMode && (
        <span className="relative z-10 flex">
          <SelectionCheckbox
            state={selectionState}
            onToggle={onToggleSelection}
            label={t('assets.select.stationAriaLabel', { station: label })}
          />
        </span>
      )}
      <Link
        to={href}
        aria-label={label}
        className={cx('absolute inset-0', focusRingInsetClassName)}
      />
      <div className="pointer-events-none flex min-h-16 min-w-0 flex-1 items-center gap-2.5 py-2">
        <span className="flex w-7 shrink-0 justify-end">
          {unresolvedParent ? (
            <Icon.Container size={Icon.ICON_SIZE.md} className="text-text-faint" />
          ) : (
            <SecurityValue security={security} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <NicknamedName
            name={label}
            nickname={nickname}
            className="text-sm font-medium"
            truncate
          />
          <span className="flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] text-text-dim">
            {unresolvedParent ? (
              <span className="text-warning">{t('assets.unresolved.rowHint')}</span>
            ) : (
              <JumpsAwayText
                result={jumpsAway}
                t={t}
                locationId={locationId}
                linkClassName="pointer-events-auto relative z-10 -my-1.5 py-1.5"
              />
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{t('assets.itemCount', { count: itemCount })}</span>
            <span aria-hidden="true">·</span>
            <span
              className={cx(
                'tabular-nums',
                estimatedValue === 0 ? 'text-text-faint' : 'text-isk-pos'
              )}
            >
              <IskAmount value={estimatedValue} decimals={0} />
            </span>
          </span>
        </span>
        {pinned && !unresolvedParent && showPin && (
          <span className="shrink-0 text-accent">
            <Icon.Pin size={Icon.ICON_SIZE.sm} weight="fill" />
            <span className="sr-only">{t(`assets.pin.${pinState}`)}</span>
          </span>
        )}
        {actions.length < 2 && (
          <Icon.Descend size={Icon.ICON_SIZE.md} className={rowCaretClassName} />
        )}
      </div>
      {actions.length >= 2 && (
        <span className="relative z-10 flex">
          <RowMoreActions />
        </span>
      )}
    </div>
  );
  if (actions.length < 2) return row;
  return (
    <RowActionsMenu
      name={label}
      items={
        <PlaceRowMenuItems
          actions={actions}
          placeId={locationId}
          placeName={label}
          pinState={pinState}
          onTogglePin={onTogglePin}
          onRename={() => void navigate(href, { state: RENAME_PLACE_STATE })}
          t={t}
        />
      }
    >
      {row}
    </RowActionsMenu>
  );
}

interface ContainerRowProps {
  href: string;
  label: string;
  gameName?: string;
  itemCount: number;
  estimatedValue: number;
  typeId?: number;
  characterBadge: string | null;
  stationId: number | null;
  extraItems?: ReactNode;
  named: boolean;
  selectMode: boolean;
  selectionState: SelectionState;
  onToggleSelection: () => void;
  t: Translate;
}

export function ContainerRow({
  href,
  label,
  gameName,
  itemCount,
  estimatedValue,
  typeId,
  characterBadge,
  stationId,
  extraItems,
  named,
  selectMode,
  selectionState,
  onToggleSelection,
  t,
}: ContainerRowProps) {
  const actions = placeMenuActions({
    kind: 'container',
    pinnable: false,
    resolved: stationId !== null,
  });
  const name = gameName ?? label;
  const hasMenu = actions.length >= 2 || extraItems !== undefined;
  const row = (
    <div
      className={cx('flex items-center gap-2 border-b border-line pl-3', rowInteractiveClassName)}
    >
      {selectMode && (
        <SelectionCheckbox
          state={selectionState}
          onToggle={onToggleSelection}
          label={t('assets.select.branchAriaLabel', { name: label })}
        />
      )}
      <Link
        to={href}
        className={cx(
          'group flex min-h-12 min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-3',
          focusRingInsetClassName
        )}
      >
        {typeId === undefined ? (
          <Icon.Container size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-faint" />
        ) : (
          <TypeIcon typeId={typeId} size={32} className="h-6 w-6 shrink-0" />
        )}
        <span className="flex min-w-0 flex-1 items-center">
          {gameName !== undefined ? (
            <span className="flex min-w-0 flex-col">
              <h3 className="truncate text-sm font-medium">{gameName}</h3>
              <span className="truncate text-xs text-text-dim">{label}</span>
            </span>
          ) : named ? (
            <h3 className="truncate text-sm font-medium">{label}</h3>
          ) : (
            <span className="truncate text-sm text-text-dim">{label}</span>
          )}
          {characterBadge && <CharacterBadge characterName={characterBadge} />}
        </span>
        <span className="shrink-0 text-[0.6875rem] text-text-dim tabular-nums">
          {formatBadge({ itemCount, estimatedValue }, t)}
        </span>
        {!hasMenu && <Icon.Descend size={Icon.ICON_SIZE.sm} className={rowCaretClassName} />}
      </Link>
      {hasMenu && (
        <span className="flex pr-2">
          <RowMoreActions />
        </span>
      )}
    </div>
  );
  if (!hasMenu) return row;
  return (
    <RowActionsMenu
      name={name}
      items={
        <>
          <PlaceRowMenuItems actions={actions} placeId={stationId} placeName={name} t={t} />
          {extraItems}
        </>
      }
    >
      {row}
    </RowActionsMenu>
  );
}

const ITEM_NAME_CELL = 'md:min-w-40 md:flex-[0_1_24rem]';
const ITEM_CELL = 'md:shrink-0 md:truncate md:text-right';
const ITEM_QUANTITY_CELL = cx(ITEM_CELL, 'md:w-24');
const ITEM_VOLUME_CELL = cx(ITEM_CELL, 'md:w-28');
const ITEM_VALUE_CELL = cx(ITEM_CELL, 'md:w-24');
const ITEM_COST_CELL = cx(ITEM_CELL, 'md:hidden lg:block lg:w-44');
const ITEM_MENU_SLOT = 'md:ml-auto md:flex md:w-7 md:shrink-0 md:justify-end';
const ITEM_MENU_SPACER = 'md:w-7 md:shrink-0';

interface ItemColumnLabelsProps {
  showCost?: boolean;
  sort: DataTableSort | null;
  onSort: (column: LevelSortColumn) => void;
  t: Translate;
}

export function ItemColumnLabels({ showCost = false, sort, onSort, t }: ItemColumnLabelsProps) {
  const column = (id: LevelSortColumn, label: string, cellClass: string) => {
    const active = sort?.columnId === id;
    const SortGlyph = !active
      ? Icon.Sort
      : sort.direction === 'asc'
        ? Icon.Ascending
        : Icon.Descending;
    return (
      <button
        type="button"
        onClick={() => onSort(id)}
        aria-label={
          active
            ? t('assets.columns.sortedAria', {
                label,
                direction: t(`assets.columns.${sort.direction}`),
              })
            : t('assets.columns.sortAria', { label })
        }
        className={cx(
          cellClass,
          'inline-flex items-center gap-1 hover:text-text',
          id !== 'volume' && 'uppercase',
          id !== 'name' && 'justify-end',
          focusRingInsetClassName
        )}
      >
        <span className="truncate">{label}</span>
        <SortGlyph
          aria-hidden="true"
          size={Icon.ICON_SIZE.sm}
          className={cx('shrink-0', active ? 'text-accent' : 'text-text-faint')}
        />
      </button>
    );
  };
  return (
    <div
      data-testid="item-column-labels"
      className={cx(
        eyebrowClassName,
        'sticky top-0 z-10 hidden shrink-0 items-center gap-2.5 border-b border-line bg-panel-2 py-1 pr-3 pl-3 md:flex'
      )}
    >
      {column('name', t('assets.sort.name'), cx('min-w-0', ITEM_NAME_CELL))}
      {column('quantity', t('assets.columns.quantity'), ITEM_QUANTITY_CELL)}
      {column('volume', t('assets.columns.volume'), ITEM_VOLUME_CELL)}
      {column('value', t('assets.sort.value'), ITEM_VALUE_CELL)}
      {showCost && (
        <span className={cx(ITEM_COST_CELL, 'lg:flex lg:items-center lg:justify-end lg:gap-1.5')}>
          <span className="truncate">{t('assets.columns.cost')}</span>
          <InfoTooltip
            label={t('assets.columns.costAria')}
            content={t('assets.columns.costHelp')}
            glyph="info"
          />
        </span>
      )}
      <span className={ITEM_MENU_SPACER} />
    </div>
  );
}

interface ItemRowProps {
  name: string;
  gameName?: string;
  quantity: number;
  unitVolume: number | undefined;
  estimatedValue: number;
  valueHint?: string;
  afterValue?: ReactNode;
  askEstimate?: AskEstimateFigure;
  stockUnitCost?: number;
  showStockCost?: boolean;
  characterBadge: string | null;
  blueprintKind?: BlueprintKind | null;
  typeId?: number;
  itemId?: number;
  wrap: (children: ReactElement) => ReactNode;
  selectMode: boolean;
  selectionState: SelectionState;
  onToggleSelection: () => void;
  t: Translate;
}

function ValueFigure({
  value,
  hint,
  ask,
  inLink = false,
  t,
}: {
  value: number;
  hint?: string;
  ask?: AskEstimateFigure;
  inLink?: boolean;
  t: Translate;
}) {
  if (value !== 0) return <IskAmount value={value} decimals={0} note={hint} />;
  const tip = ask?.hint ?? hint;
  const figure = ask ? (
    <span data-testid="ask-estimate">
      <span aria-hidden="true">{t('assets.askEstimate.marker')} </span>
      <IskAmount value={ask.value} decimals={0} />
      <span className="sr-only">{ask.hint}</span>
    </span>
  ) : (
    <>
      <span aria-hidden="true">{t('assets.unknownValue')}</span>
      <span className="sr-only">{hint ?? t('assets.noEstimate')}</span>
    </>
  );
  if (tip === undefined) return figure;
  if (!inLink) return <HintText content={tip}>{figure}</HintText>;
  return (
    <Tooltip content={tip}>
      <span className="relative z-10">{figure}</span>
    </Tooltip>
  );
}

function StockCostFigure({
  unitCost,
  quantity,
  t,
}: {
  unitCost: number;
  quantity: number;
  t: Translate;
}) {
  return (
    <span className={cx(ITEM_COST_CELL, 'whitespace-nowrap')}>
      <IskAmount value={unitCost * quantity} decimals={0} />{' '}
      <span className="text-text-dim">
        (<IskAmount value={unitCost} decimals={0} /> {t('assets.cost.each')})
      </span>
    </span>
  );
}

export function ItemRow({
  name,
  gameName,
  quantity,
  unitVolume,
  estimatedValue,
  valueHint,
  afterValue,
  askEstimate,
  stockUnitCost,
  showStockCost = false,
  characterBadge,
  blueprintKind = null,
  typeId,
  itemId,
  wrap,
  selectMode,
  selectionState,
  onToggleSelection,
  t,
}: ItemRowProps) {
  const guard = useLiftAfterHoldGuard();
  const volumeText =
    unitVolume === undefined ? t('assets.unknownValue') : formatUnitVolume(unitVolume);
  return (
    <div
      className={cx('flex items-center gap-2 border-b border-line pl-3', rowInteractiveClassName)}
    >
      {selectMode && (
        <SelectionCheckbox
          state={selectionState}
          onToggle={onToggleSelection}
          label={t('assets.select.itemAriaLabel', { name })}
        />
      )}
      {wrap(
        <div className="flex min-h-12 w-full min-w-0 items-center gap-2.5 py-1.5 pr-3">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:contents">
            <span className={cx('flex min-w-0 items-center gap-2', ITEM_NAME_CELL)}>
              {typeId !== undefined && (
                <TypeIcon typeId={typeId} size={32} className="h-6 w-6 shrink-0" />
              )}
              {typeId === undefined ? (
                <Tooltip content={name}>
                  {gameName === undefined ? (
                    <span className="truncate text-sm">{name}</span>
                  ) : (
                    <span className="flex min-w-0 flex-col text-sm">
                      <span className="truncate">{gameName}</span>
                      <span className="truncate text-xs text-text-dim">{name}</span>
                    </span>
                  )}
                </Tooltip>
              ) : (
                <ItemInfoLink
                  typeId={typeId}
                  itemId={itemId}
                  className={cx('flex min-w-0 items-center text-sm', tappableRowClassName)}
                  {...guard.handlers}
                  onClick={(e) => {
                    if (guard.swallowClick(e)) e.preventDefault();
                  }}
                >
                  <Tooltip content={name}>
                    {gameName === undefined ? (
                      <span className="truncate">{name}</span>
                    ) : (
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{gameName}</span>
                        <span className="truncate text-xs text-text-dim">{name}</span>
                      </span>
                    )}
                  </Tooltip>
                </ItemInfoLink>
              )}
              {blueprintKind && <BlueprintBadge kind={blueprintKind} t={t} />}
              {characterBadge && <CharacterBadge characterName={characterBadge} />}
            </span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] text-text-dim tabular-nums md:contents md:text-xs">
              <span className={ITEM_QUANTITY_CELL}>×{formatCount(quantity)}</span>
              <span aria-hidden="true" className="md:hidden">
                ·
              </span>
              <span className={ITEM_VOLUME_CELL}>{volumeText}</span>
              <span aria-hidden="true" className="md:hidden">
                ·
              </span>
              <span
                className={cx(
                  estimatedValue === 0 ? 'text-text-faint' : 'text-isk-pos',
                  ITEM_VALUE_CELL,
                  afterValue !== undefined && 'md:overflow-visible'
                )}
              >
                <ValueFigure value={estimatedValue} hint={valueHint} ask={askEstimate} t={t} />
                {afterValue}
              </span>
              {stockUnitCost !== undefined && (
                <>
                  <span aria-hidden="true" className="md:hidden">
                    ·
                  </span>
                  <StockCostFigure unitCost={stockUnitCost} quantity={quantity} t={t} />
                </>
              )}
              {stockUnitCost === undefined && showStockCost && (
                <span className={cx(ITEM_COST_CELL, 'hidden lg:block')} />
              )}
            </span>
          </span>
          <span className={ITEM_MENU_SLOT}>
            <RowMoreActions />
          </span>
        </div>
      )}
    </div>
  );
}

interface SearchResultRowProps {
  name: string;
  gameName?: string;
  quantity: number;
  estimatedValue: number;
  trail: readonly string[];
  security: number | null | undefined;
  href: string;
  characterBadge: string | null;
  blueprintKind?: BlueprintKind | null;
  valueHint?: string;
  askEstimate?: AskEstimateFigure;
  wrap: (children: ReactElement) => ReactElement;
  afterLink?: ReactNode;
  t: Translate;
}

export function SearchResultRow({
  name,
  gameName,
  quantity,
  estimatedValue,
  trail,
  security,
  href,
  characterBadge,
  blueprintKind = null,
  valueHint,
  askEstimate,
  wrap,
  afterLink,
  t,
}: SearchResultRowProps) {
  return (
    <div className={cx('border-b border-line', rowInteractiveClassName)}>
      {wrap(
        <div className="flex items-center">
          <Link
            to={href}
            className={cx(
              'group flex min-h-16 min-w-0 flex-1 items-center gap-2.5 py-2 pl-3',
              focusRingInsetClassName
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="flex min-w-0 flex-1 items-center">
                  {gameName === undefined ? (
                    <span className="truncate text-sm font-medium">{name}</span>
                  ) : (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{gameName}</span>
                      <span className="truncate text-xs font-normal text-text-dim">{name}</span>
                    </span>
                  )}
                  {blueprintKind && <BlueprintBadge kind={blueprintKind} t={t} />}
                  {characterBadge && <CharacterBadge characterName={characterBadge} />}
                </span>
                <span className="shrink-0 text-sm tabular-nums">×{formatCount(quantity)}</span>
              </span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <SecurityValue security={security} />
                  <span className="truncate text-[0.6875rem] text-text-dim">
                    {trail.join(' › ')}
                  </span>
                </span>
                <span
                  className={cx(
                    'shrink-0 text-[0.6875rem] tabular-nums',
                    estimatedValue === 0 ? 'text-text-faint' : 'text-isk-pos'
                  )}
                >
                  <ValueFigure
                    value={estimatedValue}
                    hint={valueHint}
                    ask={askEstimate}
                    inLink
                    t={t}
                  />
                </span>
              </span>
            </span>
          </Link>
          {afterLink}
          <span className="shrink-0 px-2">
            <RowMoreActions />
          </span>
        </div>
      )}
    </div>
  );
}

interface SectionHeadingProps {
  children: ReactNode;
  tone?: 'default' | 'warning';
}

export function SectionHeading({ children, tone = 'default' }: SectionHeadingProps) {
  return (
    <div
      role="heading"
      aria-level={3}
      className={cx(
        'flex items-center gap-1.5 border-y border-line px-3 py-1.5 text-[0.6875rem] font-semibold tracking-widest uppercase',
        tone === 'warning' ? 'bg-panel-2 text-warning' : 'bg-panel-2 text-text-dim'
      )}
    >
      {tone === 'warning' && <Icon.Warn size={Icon.ICON_SIZE.sm} />}
      {children}
    </div>
  );
}
