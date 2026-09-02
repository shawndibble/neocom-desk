/**
 * Row components for the Assets drill-down (issue #148 follow-up).
 *
 * Every row here obeys one layout rule, which is the whole point of the
 * rework: nothing is laid out in fixed-width columns that a 390px screen
 * cannot honour. A row is a name that truncates and one wrapping metadata
 * line beneath it — item count, ISK value, security, jumps — rendered once
 * (no `sm:hidden`/`hidden sm:flex` duplicate pair), so the page never
 * scrolls sideways and never puts the same text in the DOM twice at any
 * width. Numbers that used to be fixed-width columns (`w-14`/`w-16`/`w-20`)
 * are gone; they wrap with everything else.
 */

import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatVolume } from '@/features/market/format';
import { typeIconUrl } from '@/lib/eveImages';
import { securityStatusColor } from '@/engine/securityStatus';
import { formatBadge } from './assetBrowserFormat';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import type { PinState } from '@/features/character/stationPins';
import type { SelectionState } from '@/features/character/assetSelection';
import { SelectionCheckbox } from './SelectionCheckbox';

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
}

/** Renders nothing until its route call settles — a progressive enhancement, never load-blocking. */
export function JumpsAwayText({ result, t }: JumpsAwayTextProps) {
  if (!result) return null;
  if (result.kind === 'known') {
    return (
      <span className="tabular-nums">{t('assets.jumpsAway.value', { count: result.jumps })}</span>
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
      className="ml-1.5 shrink-0 rounded-xs border border-line bg-panel-2 px-1 py-0.5 text-[0.625rem] text-text-dim"
      title={t('assets.crossCharacterBadge', { character: characterName })}
    >
      {characterName}
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
          <span className="flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] text-text-faint">
            {unresolvedParent ? (
              <span className="text-warning">{t('assets.unresolved.rowHint')}</span>
            ) : (
              <JumpsAwayText result={jumpsAway} t={t} />
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{t('assets.itemCount', { count: itemCount })}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums text-isk-pos">{formatIsk(estimatedValue)}</span>
          </span>
        </span>
        <Icon.Descend size={Icon.ICON_SIZE.md} className="shrink-0 text-text-faint" />
      </Link>
      {!unresolvedParent && (
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
}: ContainerRowProps) {
  return (
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
        <span className="shrink-0 text-[0.6875rem] text-text-faint tabular-nums">
          {formatBadge({ itemCount, estimatedValue }, t)}
        </span>
        <Icon.Descend size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-faint" />
      </Link>
    </div>
  );
}

/* ---------------------------------------------------------------- item row */

interface ItemRowProps {
  name: string;
  quantity: number;
  unitVolume: number | undefined;
  estimatedValue: number;
  characterBadge: string | null;
  /** Wraps the row in the shared item context menu — supplied by the route. */
  wrap: (children: ReactElement) => ReactNode;
  /** Selects this asset into the detail pane beside the list (issue #160). */
  onSelect: () => void;
  /** Whether this row's asset is the one currently shown in the detail pane. */
  selected: boolean;
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
 * Selecting a row shows its full detail in the pane beside the list
 * (`AssetDetailPane`, issue #160) — replaces the previous hover/focus
 * tooltip, which couldn't be reached on a touch device at all.
 */
export function ItemRow({
  name,
  quantity,
  unitVolume,
  estimatedValue,
  characterBadge,
  wrap,
  onSelect,
  selected,
  selectMode,
  selectionState,
  onToggleSelection,
  t,
}: ItemRowProps) {
  const volumeText = unitVolume === undefined ? t('assets.unknownValue') : formatVolume(unitVolume);
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
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected}
          className={cx(
            'flex min-h-12 w-full min-w-0 items-center gap-2.5 py-1.5 pr-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent',
            selected ? 'bg-panel-2' : ''
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center">
              <span className="truncate text-sm">{name}</span>
              {characterBadge && <CharacterBadge characterName={characterBadge} t={t} />}
            </span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] text-text-faint tabular-nums">
              <span>×{quantity.toLocaleString()}</span>
              <span aria-hidden="true">·</span>
              <span>{volumeText}</span>
              <span aria-hidden="true">·</span>
              <span className="text-isk-pos">{formatIsk(estimatedValue)}</span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- detail pane */

export interface AssetDetailPaneProps {
  typeId: number;
  name: string;
  quantity: number;
  unitVolume: number | undefined;
  estimatedValue: number;
  characterBadge: string | null;
  /** Where this asset lives, outermost first, joined the same way `SearchResultRow`'s trail is. */
  locationLabel: string;
  security: number | null | undefined;
  jumpsAway: JumpsAwayResult | undefined;
  t: Translate;
}

/**
 * One selected asset's full detail, replacing the old hover/focus tooltip
 * (issue #160): icon, name, quantity, estimated value, volume, and the
 * location it lives in — security/jumps-away reuse whatever the route has
 * already resolved for that station rather than fetching fresh per
 * selection (CONTEXT.md round 14).
 */
export function AssetDetailPane({
  typeId,
  name,
  quantity,
  unitVolume,
  estimatedValue,
  characterBadge,
  locationLabel,
  security,
  jumpsAway,
  t,
}: AssetDetailPaneProps) {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <img
          src={typeIconUrl(typeId, 64)}
          alt=""
          width={48}
          height={48}
          className="shrink-0 rounded-xs border border-line"
        />
        <span className="flex min-w-0 flex-1 items-center">
          <h2 className="truncate text-sm font-semibold">{name}</h2>
          {characterBadge && <CharacterBadge characterName={characterBadge} t={t} />}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-dim uppercase">{t('assets.detail.quantity')}</dt>
        <dd className="tabular-nums">{quantity.toLocaleString()}</dd>

        <dt className="text-text-dim uppercase">{t('assets.detail.volume')}</dt>
        <dd className="tabular-nums">
          {unitVolume === undefined
            ? t('assets.detail.volumeUnknown')
            : t('assets.detail.volumeValue', { volume: formatVolume(unitVolume) })}
        </dd>

        <dt className="text-text-dim uppercase">{t('assets.detail.location')}</dt>
        <dd className="flex min-w-0 items-center gap-1.5">
          <SecurityValue security={security} t={t} />
          <span className="min-w-0 truncate">{locationLabel}</span>
        </dd>

        <dt className="text-text-dim uppercase">{t('assets.detail.jumpsAway')}</dt>
        <dd>
          <JumpsAwayText result={jumpsAway} t={t} />
        </dd>

        <dt className="text-text-dim uppercase">{t('assets.detail.value')}</dt>
        <dd className="tabular-nums font-semibold text-isk-pos">
          {t('assets.detail.valueAmount', { value: formatIsk(estimatedValue) })}
        </dd>
      </dl>
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
  t: Translate;
}

/**
 * A search hit. Search deliberately leaves the drill-down and reports across
 * every location at once — filtering only the level you happen to be standing
 * in would make "Search all characters" meaningless — so each hit has to say
 * where it lives, and links straight to that place.
 */
export function SearchResultRow({
  name,
  quantity,
  estimatedValue,
  trail,
  security,
  href,
  characterBadge,
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
            {characterBadge && <CharacterBadge characterName={characterBadge} t={t} />}
          </span>
          <span className="shrink-0 text-sm tabular-nums">×{quantity.toLocaleString()}</span>
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <SecurityValue security={security} t={t} />
            <span className="truncate text-[0.6875rem] text-text-faint">{trail.join(' › ')}</span>
          </span>
          <span className="shrink-0 text-[0.6875rem] text-isk-pos tabular-nums">
            {formatIsk(estimatedValue)}
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
