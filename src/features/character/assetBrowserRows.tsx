/**
 * Row components for the Assets drill-down (issue #148 follow-up).
 *
 * Every row here obeys one layout rule, which is the whole point of the
 * rework: below `md`, nothing is laid out in fixed-width columns that a 390px
 * screen cannot honour (the one md+ exception is an item row's figure cells,
 * see `ItemRow`). A row is a name that truncates and one wrapping metadata
 * line beneath it — item count, ISK value, security, jumps — rendered once
 * (no `sm:hidden`/`hidden sm:flex` duplicate pair), so the page never
 * scrolls sideways and never puts the same text in the DOM twice at any
 * width. Below `md` the numbers that used to be fixed-width columns
 * (`w-14`/`w-16`/`w-20`) wrap with everything else.
 */

import { useRef, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconButton, IskAmount, RowActionsMenu, RowMoreActions } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { formatUnitVolume } from '@/lib/volume';
import { securityStatusColor } from '@/engine/securityStatus';
import { formatBadge } from './assetBrowserFormat';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import type { PinState } from '@/features/character/stationPins';
import type { SelectionState } from '@/features/character/assetSelection';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { PlaceJumpsLink } from '@/features/travel/JumpsLink';
import { SelectionCheckbox } from './SelectionCheckbox';
import type { BlueprintKind } from '@/engine/blueprintKind';

export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/* ------------------------------------------------------------------ badges */

interface SecurityValueProps {
  /** Undefined while still resolving, null when unresolvable — renders nothing either way. */
  security: number | null | undefined;
  t: Translate;
}

/**
 * A solar system's security status on the game's own scale
 * (`securityStatusColor`). The number is always spelled out rather than
 * reduced to a coloured dot — DESIGN.md §7, colour is never the only signal.
 */
export function SecurityValue({ security, t }: SecurityValueProps) {
  if (security === null || security === undefined) return null;
  const value = security.toFixed(1);
  return (
    <span
      className="shrink-0 text-[0.6875rem] font-semibold tabular-nums"
      style={{ color: securityStatusColor(security) }}
      title={t('assets.security.ariaLabel', { value })}
    >
      {value}
    </span>
  );
}

interface JumpsAwayTextProps {
  result: JumpsAwayResult | undefined;
  t: Translate;
  /** The place counted to; when given, a known count opens the route to it. Leave out inside a link — a button can't nest in one. */
  locationId?: number;
  /** The page's own route picker, carried into the route the count opens. */
  preference?: RoutePreferenceKind | null;
}

/** Renders nothing until its route call settles — a progressive enhancement, never load-blocking. */
export function JumpsAwayText({ result, t, locationId, preference }: JumpsAwayTextProps) {
  if (!result) return null;
  if (result.kind === 'known') {
    const text = t('assets.jumpsAway.value', { count: result.jumps });
    return locationId === undefined ? (
      <span className="tabular-nums">{text}</span>
    ) : (
      <PlaceJumpsLink locationId={locationId} preference={preference} className="tabular-nums">
        {text}
      </PlaceJumpsLink>
    );
  }
  return (
    <span className="tabular-nums" title={t(`assets.jumpsAway.unknownReason.${result.reason}`)}>
      {t('assets.jumpsAway.unknown')}
    </span>
  );
}

interface CharacterBadgeProps {
  characterName: string;
  t: Translate;
}

/** Marks a row as belonging to a Character other than the active one. */
export function CharacterBadge({ characterName, t }: CharacterBadgeProps) {
  return (
    <span
      className="ml-1.5 shrink-0 rounded-xs border border-line bg-panel-2 px-1 py-0.5 text-[0.6875rem] text-text-dim"
      title={t('assets.crossCharacterBadge', { character: characterName })}
    >
      {characterName}
    </span>
  );
}

interface BlueprintBadgeProps {
  kind: BlueprintKind;
  t: Translate;
}

/** Per kind: the visible abbreviation, the full name a screen reader hears, and its hue (DESIGN.md §1 "Blueprints"). */
const BLUEPRINT_BADGE: Record<BlueprintKind, { label: string; name: string; className: string }> = {
  original: {
    label: 'assets.blueprintBadge.original.label',
    name: 'assets.blueprintBadge.original.name',
    className: 'border-accent-dim text-accent',
  },
  copy: {
    label: 'assets.blueprintBadge.copy.label',
    name: 'assets.blueprintBadge.copy.name',
    className: 'border-blueprint-copy/50 text-blueprint-copy',
  },
};

/**
 * Marks a blueprint stack as a **BPO** or a **BPC** (CONTEXT.md) — the one
 * distinction the item name can't carry, since a copy shares its original's
 * typeID and name. The written label, not the colour, is the signal
 * (DESIGN.md §7); a screen reader hears the full name instead of the letters.
 */
export function BlueprintBadge({ kind, t }: BlueprintBadgeProps) {
  const badge = BLUEPRINT_BADGE[kind];
  return (
    <span
      className={cx(
        'ml-1.5 shrink-0 rounded-xs border px-1 py-0.5 text-[0.6875rem] font-semibold',
        badge.className
      )}
    >
      <span aria-hidden="true">{t(badge.label)}</span>
      <span className="sr-only">{t(badge.name)}</span>
    </span>
  );
}

/* ------------------------------------------------------------- location row */

interface LocationRowProps {
  href: string;
  label: string;
  security: number | null | undefined;
  jumpsAway: JumpsAwayResult | undefined;
  itemCount: number;
  estimatedValue: number;
  pinState: PinState;
  onTogglePin: () => void;
  /** Set when this "location" is really an orphan group — an asset whose parent wasn't in the fetch. */
  unresolvedParent?: boolean;
  /** Corp assets has no pinning concept (no device-local "current owner" to pin per) — hides the pin control entirely rather than rendering one nothing can toggle meaningfully. */
  showPin?: boolean;
  selectMode: boolean;
  selectionState: SelectionState;
  onToggleSelection: () => void;
  t: Translate;
}

/**
 * One location in the root list. The whole row is the link into it — a 64px
 * target rather than a chevron a thumb has to find — with the pin as the one
 * independently-focusable control beside it.
 */
export function LocationRow({
  href,
  label,
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
  const pinLabel = t('assets.pin.ariaLabel', {
    station: label,
    state: t(`assets.pin.${pinState}`),
  });
  return (
    <div className="flex items-center gap-2 border-b border-line pr-2 pl-3 hover:bg-panel-2">
      {selectMode && (
        <SelectionCheckbox
          state={selectionState}
          onToggle={onToggleSelection}
          label={t('assets.select.stationAriaLabel', { station: label })}
        />
      )}
      <Link
        to={href}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-2.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        <span className="flex w-7 shrink-0 justify-end">
          {unresolvedParent ? (
            <Icon.Container size={Icon.ICON_SIZE.md} className="text-text-faint" />
          ) : (
            <SecurityValue security={security} t={t} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] text-text-dim">
            {unresolvedParent ? (
              <span className="text-warning">{t('assets.unresolved.rowHint')}</span>
            ) : (
              <JumpsAwayText result={jumpsAway} t={t} />
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{t('assets.itemCount', { count: itemCount })}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums text-isk-pos">
              <IskAmount value={estimatedValue} decimals={0} />
            </span>
          </span>
        </span>
        <Icon.Descend size={Icon.ICON_SIZE.md} className="shrink-0 text-text-faint" />
      </Link>
      {!unresolvedParent && showPin && (
        <IconButton
          icon={
            <Icon.Pin
              size={Icon.ICON_SIZE.md}
              weight={pinState === 'unpinned' ? 'light' : 'fill'}
            />
          }
          label={pinLabel}
          pressed={pinState !== 'unpinned'}
          onClick={onTogglePin}
          variant="plain"
          size="sm"
          className={pinState === 'unpinned' ? '' : 'text-accent'}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------- container row */

interface ContainerRowProps {
  href: string;
  label: string;
  itemCount: number;
  estimatedValue: number;
  characterBadge: string | null;
  /** A bay (Cargo Hold/Drone Bay/Fitting) has no asset of its own — plain text, not a heading, same as a station's `h2`/an item's plain name. A ship or container names a real, ownable entity and gets an `h3`, same distinction the tree view made. */
  named: boolean;
  selectMode: boolean;
  selectionState: SelectionState;
  onToggleSelection: () => void;
  t: Translate;
  /** A ship's own actions (Open in Fittings), on right-click and a More actions button. */
  menu?: { name: string; items: ReactNode };
}

/** A ship, bay or container inside the current level — descends one more step. */
export function ContainerRow({
  href,
  label,
  itemCount,
  estimatedValue,
  characterBadge,
  named,
  selectMode,
  selectionState,
  onToggleSelection,
  t,
  menu,
}: ContainerRowProps) {
  const row = (
    <div className="flex items-center gap-2 border-b border-line pl-3 hover:bg-panel-2">
      {selectMode && (
        <SelectionCheckbox
          state={selectionState}
          onToggle={onToggleSelection}
          label={t('assets.select.branchAriaLabel', { name: label })}
        />
      )}
      <Link
        to={href}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        <Icon.Container size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-faint" />
        <span className="flex min-w-0 flex-1 items-center">
          {named ? (
            <h3 className="truncate text-sm font-medium">{label}</h3>
          ) : (
            <span className="truncate text-sm text-text-dim">{label}</span>
          )}
          {characterBadge && <CharacterBadge characterName={characterBadge} t={t} />}
        </span>
        <span className="shrink-0 text-[0.6875rem] text-text-dim tabular-nums">
          {formatBadge({ itemCount, estimatedValue }, t)}
        </span>
        <Icon.Descend size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-faint" />
      </Link>
      {menu && <RowMoreActions className="mr-1" />}
    </div>
  );
  return menu ? (
    <RowActionsMenu name={menu.name} items={menu.items}>
      {row}
    </RowActionsMenu>
  ) : (
    row
  );
}

/* ---------------------------------------------------------------- item row */

/*
 * md+ column geometry for an item row. The label strip
 * (`ItemColumnLabels`) reads the same constants, so the labels sit over the
 * cells by construction rather than by two hand-matched sets of widths.
 * Below `md` none of these apply and the figures wrap as before.
 */
const ITEM_CELL = 'md:shrink-0 md:truncate md:text-right';
const ITEM_QUANTITY_CELL = cx(ITEM_CELL, 'md:w-24');
const ITEM_VOLUME_CELL = cx(ITEM_CELL, 'md:w-28');
const ITEM_VALUE_CELL = cx(ITEM_CELL, 'md:w-24');
/** The row menu button's md+ box (`IconButton` size `row`, `md:size-7`), reserved even when the row has no menu. */
const ITEM_MENU_SLOT = 'md:flex md:w-7 md:shrink-0 md:justify-end';
const ITEM_MENU_SPACER = 'md:w-7 md:shrink-0';

interface ItemColumnLabelsProps {
  t: Translate;
}

/**
 * The label strip above a level's item rows, md+ only. Right-aligned to the
 * same cells `ItemRow` lays out; container rows in the same level keep their
 * own shape and simply have no figures under it.
 */
export function ItemColumnLabels({ t }: ItemColumnLabelsProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="item-column-labels"
      className="sticky top-0 z-10 hidden shrink-0 items-center gap-2.5 border-b border-line bg-panel-2 py-1 pr-3 pl-3 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase md:flex"
    >
      <span className="min-w-0 flex-1 truncate">{t('assets.sort.name')}</span>
      <span className={ITEM_QUANTITY_CELL}>{t('assets.columns.quantity')}</span>
      <span className={ITEM_VOLUME_CELL}>{t('assets.columns.volume')}</span>
      <span className={ITEM_VALUE_CELL}>{t('assets.sort.value')}</span>
      <span className={ITEM_MENU_SPACER} />
    </div>
  );
}

/**
 * How long a touch has to be held before it reads as the row menu's
 * long-press rather than a tap — Radix opens the context menu at 700ms, so
 * anything past `Tooltip`'s own 500ms hold is already that gesture.
 */
const LONG_PRESS_MS = 500;

/**
 * An item's name as the way into its Show info. It sits inside the row menu's
 * trigger, so a touch-and-hold on it opens that menu — and some browsers
 * still send a click when the finger lifts. That click is swallowed: a press
 * that became a context menu (or was held that long) never opens Show info
 * on top of the menu it just opened.
 */
function ItemNameButton({ name, onShowInfo }: { name: string; onShowInfo: () => void }) {
  const press = useRef<{ start: number; touch: boolean; menu: boolean } | null>(null);
  return (
    <button
      type="button"
      className={cx(
        'min-w-0 cursor-pointer truncate text-left text-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        tappableRowClassName
      )}
      title={name}
      onPointerDown={(event) => {
        press.current = {
          start: event.timeStamp,
          touch: event.pointerType !== 'mouse',
          menu: false,
        };
      }}
      onContextMenu={() => {
        if (press.current) press.current.menu = true;
      }}
      onClick={(event) => {
        const p = press.current;
        press.current = null;
        if (p && (p.menu || (p.touch && event.timeStamp - p.start >= LONG_PRESS_MS))) return;
        onShowInfo();
      }}
    >
      {name}
    </button>
  );
}

interface ItemRowProps {
  name: string;
  quantity: number;
  unitVolume: number | undefined;
  estimatedValue: number;
  characterBadge: string | null;
  /** Set on a blueprint stack: a BPO or BPC badge beside the name. */
  blueprintKind?: BlueprintKind | null;
  /** Makes the name a button opening Show info — the row menu's first action, one click closer. */
  onShowInfo?: () => void;
  /** Wraps the row in the shared item context menu — supplied by the route. */
  wrap: (children: ReactElement) => ReactNode;
  selectMode: boolean;
  selectionState: SelectionState;
  onToggleSelection: () => void;
  t: Translate;
}

/**
 * A leaf asset: name, then quantity/volume/value on one wrapping metadata
 * line. The fixed-width three-column layout this replaces (`Assets.tsx`'s
 * old `w-14`/`w-16`/`w-20` trio) is exactly what made the row unreadable
 * below ~500px — this reflows instead of clipping or scrolling sideways.
 *
 * Full item detail (icon, volume, location, jumps-away) lives behind the
 * row's menu's "Show info" action — right-click, or the More actions button
 * the menu publishes into the row — not on the row itself. With `onShowInfo`
 * the name opens it directly too: a real button inside the menu's trigger,
 * never wrapping another control, so right-click and long-press still reach
 * the menu from it.
 */
export function ItemRow({
  name,
  quantity,
  unitVolume,
  estimatedValue,
  characterBadge,
  blueprintKind = null,
  onShowInfo,
  wrap,
  selectMode,
  selectionState,
  onToggleSelection,
  t,
}: ItemRowProps) {
  const volumeText =
    unitVolume === undefined ? t('assets.unknownValue') : formatUnitVolume(unitVolume);
  return (
    <div className="flex items-center gap-2 border-b border-line pl-3 hover:bg-panel-2">
      {selectMode && (
        <SelectionCheckbox
          state={selectionState}
          onToggle={onToggleSelection}
          label={t('assets.select.itemAriaLabel', { name })}
        />
      )}
      {wrap(
        <div className="flex min-h-12 w-full min-w-0 items-center gap-2.5 py-1.5 pr-3">
          {/* `md:contents` dissolves both wrappers at md+, so the name and the
              three figures become direct cells of this flex row — one DOM,
              two layouts (a stacked name + wrapping line below, a table row
              above). */}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:contents">
            <span className="flex min-w-0 items-center md:flex-1">
              {onShowInfo ? (
                <ItemNameButton name={name} onShowInfo={onShowInfo} />
              ) : (
                <span className="truncate text-sm" title={name}>
                  {name}
                </span>
              )}
              {blueprintKind && <BlueprintBadge kind={blueprintKind} t={t} />}
              {characterBadge && <CharacterBadge characterName={characterBadge} t={t} />}
            </span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] text-text-dim tabular-nums md:contents md:text-xs">
              <span className={ITEM_QUANTITY_CELL}>×{quantity.toLocaleString()}</span>
              <span aria-hidden="true" className="md:hidden">
                ·
              </span>
              <span className={ITEM_VOLUME_CELL}>{volumeText}</span>
              <span aria-hidden="true" className="md:hidden">
                ·
              </span>
              <span className={cx('text-isk-pos', ITEM_VALUE_CELL)}>
                <IskAmount value={estimatedValue} decimals={0} />
              </span>
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

/* -------------------------------------------------------- search result row */

interface SearchResultRowProps {
  name: string;
  quantity: number;
  estimatedValue: number;
  /** Where this item lives, outermost first — the drill-down path it would take to reach it. */
  trail: readonly string[];
  security: number | null | undefined;
  href: string;
  characterBadge: string | null;
  /** Set on a blueprint stack: a BPO or BPC badge beside the name. */
  blueprintKind?: BlueprintKind | null;
  t: Translate;
}

/**
 * A search hit. Search deliberately leaves the drill-down and reports across
 * every location at once — filtering only the level you happen to be standing
 * in would make "Search all characters" meaningless — so each hit has to say
 * where it lives, and links straight to that place. The whole row is that
 * link, so its name stays plain text — a Show info button there would nest
 * one control inside another; the hit's own place has it one tap away.
 */
export function SearchResultRow({
  name,
  quantity,
  estimatedValue,
  trail,
  security,
  href,
  characterBadge,
  blueprintKind = null,
  t,
}: SearchResultRowProps) {
  return (
    <div className="border-b border-line hover:bg-panel-2">
      <Link
        to={href}
        className="flex min-h-16 flex-col gap-1 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="flex min-w-0 flex-1 items-center">
            <span className="truncate text-sm font-medium">{name}</span>
            {blueprintKind && <BlueprintBadge kind={blueprintKind} t={t} />}
            {characterBadge && <CharacterBadge characterName={characterBadge} t={t} />}
          </span>
          <span className="shrink-0 text-sm tabular-nums">×{quantity.toLocaleString()}</span>
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <SecurityValue security={security} t={t} />
            <span className="truncate text-[0.6875rem] text-text-dim">{trail.join(' › ')}</span>
          </span>
          <span className="shrink-0 text-[0.6875rem] text-isk-pos tabular-nums">
            <IskAmount value={estimatedValue} decimals={0} />
          </span>
        </span>
      </Link>
    </div>
  );
}

/* ---------------------------------------------------------------- section */

interface SectionHeadingProps {
  children: ReactNode;
  tone?: 'default' | 'warning';
}

/** Splits a list into named runs — "Pinned", "All locations", "Location unresolved". */
export function SectionHeading({ children, tone = 'default' }: SectionHeadingProps) {
  return (
    <div
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
