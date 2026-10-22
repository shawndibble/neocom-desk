/**
 * The "This Character / All Characters" toggle shared by every page that can
 * show more than one Character's data (Wallet, Assets, Market, Contracts,
 * Industry…, each in its `PageHeader`'s `scope`) and by the synced default in
 * Settings (issue #607).
 *
 * Used to also offer a hand-picked subset of specific characters (a
 * checkbox-per-character list with a search box, the `MoonMiningTax.tsx`
 * shape this generalised) — narrowed to just these two states because
 * nothing in the product actually named a partial subset as a feature: every
 * caller's own comments described only "current" or "all," a pilot never had
 * a reason documented for picking exactly 2 of 4 alts, and no test ever
 * exercised one. See the scope decision recording the narrowing.
 *
 * "This Character" emits the literal `'current'` (`CharacterFilterValue`),
 * not a `Set` frozen to whichever Character happens to be active at click
 * time — so a Settings default of "This Character" keeps meaning "whichever
 * one I'm on," not "always character #91," and a page-level toggle keeps
 * following a Character switch without any resync logic of its own
 * (`useResolvedCharacterFilter` re-resolves it whenever the active Character
 * changes instead).
 *
 * Named CharacterFilter, not "character scope": "scope" already means an ESI
 * OAuth grant everywhere else in this app (`ESI_REGISTRY[...].scope`,
 * `routeScopes.ts`), and reusing the word here would read as a third,
 * unrelated meaning.
 *
 * Where it goes: one per page, in the `PageHeader`'s `scope` slot — the first
 * item of the header's right-hand control cluster, before the page's actions
 * (the AlertsBell stays last) — and not at all for a caller with one
 * Character to offer. The slot sets the header's touch tier itself
 * (`PageHeaderClusterContext`), so no `size` is needed there. A
 * page's partial-coverage readout and its loading spinner ride in this
 * trigger (`missingNames`, `loading`), not beside it. See
 * `docs/context/decisions/20261022-123837-the-character-picker-rides-first-in-the-page.md`
 * (which supersedes the placement half of the 2026-09-08 panel-header
 * decision; its one-Character rule stands). The `variant="field"` form for
 * Settings is a form field and is outside that rule.
 *
 * The trigger is the same at every width and carries no words: faces and a
 * small caret, at the height of the `IconButton`s beside it (44px below `md`
 * or on a touch pointer, 36px from `md`). "This character" is the active
 * Character's portrait; "All characters" is up to three overlapping portraits
 * (two below `md`, chosen in JS with `useIsNarrow`)
 * of the Characters it covers (the active one first, then the roster in the
 * order it was added, read from Dexie: no ESI call; see `characterStack`),
 * with a "+N" chip for the rest; "Corporation" is the corp logo. Before the
 * roster has loaded, "All" shows the generic `AllCharacters` glyph. The
 * accessible name keeps the full words ("All characters · 4"), and a
 * `Tooltip` shows the same words on hover and focus. The trigger also
 * absorbed the phone-only "whose data is this" avatar `PageHeader` used to
 * float in its own corner (#1764).
 *
 * Partial coverage: with `missingNames` and the value "all", those
 * Characters drop out of the stack, a warning dot marks the trigger, the
 * accessible name and tooltip add "Not included: …", and the open menu names
 * who is missing in a non-interactive note. `loading` puts a `Spinner` over
 * the faces, which stay (invisible) underneath so the trigger never changes
 * width mid-load.
 *
 * `corporation` adds a third option, "Corporation", for a page that has a corp
 * view of the same data (Market orders, Contracts): that view is a choice on
 * this picker, not a separate switch. It emits `'corporation'`
 * (`CharacterScopeChoice`, which widens `CharacterFilterValue` without
 * changing it), and the trigger's glyph for it is the active Character's own
 * corporation logo (`CorporationLogoGlyph`, from the Character's cached
 * `corporationId`; the `Corporation` Buildings glyph while it loads, on error,
 * or with no corp known), the way "This character" shows the portrait.
 * `hideAll` drops "All characters" for a page that cannot sum Characters.
 * The options follow from the Character count and those two props: one
 * Character with no Corporation renders nothing; one Character with it offers
 * This character / Corporation; several offer This / All (/ Corporation); a
 * `hideAll` page never offers All.
 */
import { forwardRef, useContext, type ButtonHTMLAttributes } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useTranslation } from 'react-i18next';
import { PageHeaderClusterContext } from '@/components/ui/pageHeaderCluster';
import * as Icon from '@/components/ui/icons';
import { ICON_SIZE } from '@/components/ui/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { characterPortraitUrl } from '@/lib/eveImages';
import { Spinner } from '@/components/ui/Spinner';
import { Tooltip } from '@/components/ui/Tooltip';
import { cx } from '@/lib/cx';
import { CorporationLogoGlyph } from './CorporationLogoGlyph';
import { characterStack, STACK_MAX_FACES, STACK_MAX_FACES_NARROW } from './characterStack';
import { useIsNarrow } from '@/lib/useIsNarrow';
import {
  fieldBaseClassName,
  controlHeightClassName,
  fieldSizeClassName,
  focusRingClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import { useResolvedCharacterFilter, type CharacterFilterValue } from './characterFilterValue';

/** The picker's value when a page offers a Corporation option: the Character filter plus `'corporation'`. */
export type CharacterScopeChoice = CharacterFilterValue | 'corporation';

export interface CharacterFilterControlProps<
  V extends CharacterScopeChoice = CharacterFilterValue,
> {
  /** Null with no active Character — `resolveCharacterFilter` then reads `'current'` as `'all'`, so the trigger and its "This character" option both fall away on their own. */
  activeCharacterId: number | null;
  value: V;
  onChange: (next: V) => void;
  /** Adds the "Corporation" option (value `'corporation'`). Widen `V` to `CharacterScopeChoice` with it. */
  corporation?: boolean;
  /** Leaves out "All characters", for a page that cannot sum Characters. */
  hideAll?: boolean;
  /**
   * The sibling touch tier this trigger's height must match,
   * mirroring `IconButtonSize`'s two below-`md` values (`size-9`/`size-11`) —
   * not the full `IconButtonSize` (there is no `'row'` tier here). `'sm'`
   * (default) for a panel's own `meta` row, where the `IconButton`s beside it
   * (Active Jobs, Open Orders, Mining Tax) are themselves `size="sm"`.
   * `'md'` for a `PageHeader`'s `meta`, where that header's own `actions`
   * cluster sits at `IconButton`'s default (larger) tier instead (Mining Tax
   * Overview) — see `PageHeader`'s own doc comment. Inside a
   * `PageHeader`'s `scope` slot this prop is ignored: the header's
   * `'md'` tier always applies (`PageHeaderClusterContext`).
   */
  size?: 'sm' | 'md';
  /**
   * `'icon'` (default): the compact header trigger above, faces and a caret
   * with no words; it only suits a header row where the page title says what
   * it filters. `'field'`: a form control for a settings row — field chrome
   * (§6c "a box sized like a field") with the current value as text and a
   * trailing `CaretDown` at every width.
   */
  variant?: 'icon' | 'field';
  /** `variant="field"` only: the setting's name. The button's accessible name becomes "<name>: <value>", since the value alone doesn't say what is being set. */
  triggerLabel?: string;
  /** How many Characters "All" covers. Shown in its label ("All characters · 4"), the choosable form of `CharacterScopeReadout`. */
  characterCount?: number;
  /** Per-Character unread, listed under the options (Mail, issue #2867). Read-only: it informs the choice, it is not one. */
  unreadByCharacter?: readonly { characterId: number; name: string; unread: number }[];
  /**
   * Names of the Characters "All" leaves out (no grant, not yet synced). With
   * the value "all" and a non-empty list the label does not change; a warning
   * dot marks the trigger at every width, its accessible name adds "Not
   * included: {names}", and the open menu shows that line as a note.
   */
  missingNames?: readonly string[];
  /** The page's data for this scope is loading: a `Spinner` stands in the trigger, at the same box size. */
  loading?: boolean;
}

/**
 * The face box inside the trigger, the same at both size tiers: 24px where
 * the trigger is 44px (below `md`, or a touch pointer), 20px from `md` (an
 * `IconButton` glyph's size). Each face after the first tucks half under the
 * one before it (`FACE_OVERLAP`); the ring in the trigger's own fill
 * separates them. Three faces, a "+N" and the caret stay about 72px wide at
 * 36px tall.
 */
const FACE_BOX = 'size-6 md:size-5 touch:size-6';
const FACE_OVERLAP = '-ml-3 md:-ml-2.5 touch:-ml-3';
const FACE_RING = 'rounded-full ring-2 ring-panel-2';

/**
 * Height from the tier (`controlHeightClassName`, which steps down at `md`
 * and back up for `touch:`), so the trigger is level with the `IconButton`s
 * beside it; the width is the faces' own plus the caret. The default-tone
 * ghost colours are `iconButtonClassName`'s cascade, copied rather than
 * composed because composing it would pull in its coupled `size-*` too.
 */
const triggerBaseClassName =
  `relative inline-flex shrink-0 items-center rounded-xs border border-line px-1 ` +
  `${interactiveClassName} ${focusRingClassName} ` +
  `bg-panel-2 text-text-dim hover:border-line-bright hover:text-text active:bg-panel`;

export function CharacterFilterControl<V extends CharacterScopeChoice = CharacterFilterValue>({
  activeCharacterId,
  value,
  onChange,
  corporation = false,
  hideAll = false,
  size: sizeProp = 'sm',
  variant = 'icon',
  triggerLabel,
  characterCount,
  unreadByCharacter,
  missingNames,
  loading = false,
}: CharacterFilterControlProps<V>) {
  const { t, i18n } = useTranslation();
  // In a `PageHeader` cluster the header's touch tier wins, so the trigger is
  // always level with the `IconButton`s beside it.
  const size = useContext(PageHeaderClusterContext) ? 'md' : sizeProp;
  const resolved = useResolvedCharacterFilter(
    value === 'corporation' ? 'current' : value,
    activeCharacterId
  );
  // The roster in the order it was added, for the "All" faces: Dexie only, no ESI call.
  const roster = useLiveQuery(
    async () =>
      (await db.characters.toArray())
        .sort((a, b) => a.addedAt - b.addedAt)
        .map((c) => ({ characterId: c.characterId, name: c.name })),
    []
  );
  const isNarrow = useIsNarrow();
  const isCorporation = corporation && value === 'corporation';
  const isAll = !isCorporation && resolved === 'all';
  const allLabel =
    characterCount === undefined
      ? t('character.filter.allCharacters')
      : t('character.scope.all', { count: characterCount });
  const missingNote =
    missingNames && missingNames.length > 0
      ? t('character.scope.missing', {
          names: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(missingNames),
        })
      : null;
  const corporationLabel = t('character.filter.corporation');
  const label = isCorporation
    ? corporationLabel
    : isAll
      ? allLabel
      : t('character.filter.thisCharacter');
  // What there is to choose among. "All" sums Characters, so it needs more than one
  // (an unknown count keeps it, as every caller before `corporation` expected).
  const soloCharacter = characterCount !== undefined && characterCount <= 1;
  const showAll = !hideAll && !(corporation && soloCharacter);
  const showCurrent = activeCharacterId !== null;
  const isPartial = isAll && showAll && missingNote !== null;
  // One Character and no Corporation option: nothing to switch, so no picker.
  if (!corporation && soloCharacter && variant === 'icon') return null;
  const options = (
    <DropdownMenuContent align="start" className={unreadByCharacter ? 'w-60' : 'w-48'}>
      <DropdownMenuRadioGroup
        value={isCorporation ? 'corporation' : isAll ? 'all' : 'current'}
        onValueChange={(next) => onChange(next as V)}
      >
        {showCurrent && (
          <DropdownMenuRadioItem value="current">
            {t('character.filter.thisCharacter')}
          </DropdownMenuRadioItem>
        )}
        {showAll && <DropdownMenuRadioItem value="all">{allLabel}</DropdownMenuRadioItem>}
        {corporation && (
          <DropdownMenuRadioItem value="corporation">{corporationLabel}</DropdownMenuRadioItem>
        )}
      </DropdownMenuRadioGroup>
      {showAll && missingNote && (
        <>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-text-dim">{missingNote}</p>
        </>
      )}
      {unreadByCharacter && unreadByCharacter.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <ul className="px-2 py-1.5 text-xs text-text-dim">
            {unreadByCharacter.map((entry) => (
              <li key={entry.characterId} className="truncate">
                {t('character.filter.unreadFor', { name: entry.name, count: entry.unread })}
              </li>
            ))}
          </ul>
        </>
      )}
    </DropdownMenuContent>
  );

  // Hidden from assistive tech: the trigger's `aria-busy` says it, without a live region inside a button.
  const spinner = (
    <span aria-hidden="true" className="flex">
      <Spinner size="sm" label={t('common.loading')} />
    </span>
  );

  if (variant === 'field') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={triggerLabel ? `${triggerLabel}: ${label}` : undefined}
            className={`${fieldBaseClassName} ${fieldSizeClassName.md} flex w-full max-w-60 items-center justify-between gap-2 text-left`}
          >
            <span className="min-w-0 truncate">{label}</span>
            <Icon.Expanded
              size={ICON_SIZE.md}
              aria-hidden="true"
              className="shrink-0 text-text-dim"
            />
          </button>
        </DropdownMenuTrigger>
        {options}
      </DropdownMenu>
    );
  }

  const accessibleName = isPartial
    ? t('character.scope.triggerPartial', { label, missing: missingNote })
    : label;
  // Below `md` the stack draws one face fewer, so a phone header keeps its title.
  const stack = isAll
    ? characterStack(
        roster ?? [],
        activeCharacterId,
        missingNames,
        isNarrow ? STACK_MAX_FACES_NARROW : STACK_MAX_FACES
      )
    : null;
  const faces = isCorporation ? (
    <CorporationLogoGlyph characterId={activeCharacterId} size="sm" boxClassName={FACE_BOX} />
  ) : stack && stack.faces.length > 0 ? (
    <>
      {stack.faces.map((id, index) => (
        <Face key={id} characterId={id} className={cx(index > 0 && FACE_OVERLAP)} />
      ))}
      {stack.extra > 0 && (
        <span
          data-stack-extra
          className={cx(
            FACE_BOX,
            FACE_RING,
            FACE_OVERLAP,
            'flex items-center justify-center bg-panel text-[0.625rem] font-semibold text-text tabular-nums'
          )}
        >
          +{stack.extra}
        </span>
      )}
    </>
  ) : isAll || activeCharacterId === null ? (
    // The roster has not loaded (or is empty): the generic glyph holds the place.
    <Icon.AllCharacters size={ICON_SIZE.md} />
  ) : (
    <Face characterId={activeCharacterId} />
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <StackTrigger
          tooltip={accessibleName}
          aria-label={accessibleName}
          aria-busy={loading || undefined}
          className={`${controlHeightClassName[size]} ${triggerBaseClassName}`}
        >
          {/* The faces at every width. A spinner stands over them while loading,
              the faces kept (invisible) so the trigger never changes width. */}
          <span className="relative flex items-center">
            <span aria-hidden="true" className={cx('flex items-center', loading && 'invisible')}>
              {faces}
            </span>
            {loading && (
              <span className="absolute inset-0 flex items-center justify-center">{spinner}</span>
            )}
          </span>
          <Icon.Expanded size="0.75rem" aria-hidden="true" className="shrink-0" />
          {isPartial && (
            // The trigger has no words, so the dot is the visible cue.
            <span
              data-partial-dot
              aria-hidden="true"
              className="absolute -top-1 -right-1 size-2 rounded-full bg-warning ring-2 ring-bg"
            />
          )}
        </StackTrigger>
      </DropdownMenuTrigger>
      {options}
    </DropdownMenu>
  );
}

/**
 * One portrait in the trigger: `CharacterAvatar`'s image, at the trigger's own
 * face box (`CharacterAvatar` fixes its box per size, which this one steps
 * per breakpoint), with the ring that separates overlapping faces.
 */
function Face({ characterId, className }: { characterId: number; className?: string }) {
  return (
    <img
      src={characterPortraitUrl(characterId, 64)}
      crossOrigin="anonymous"
      alt=""
      width={24}
      height={24}
      loading="lazy"
      decoding="async"
      className={cx('shrink-0 border border-line bg-panel', FACE_BOX, FACE_RING, className)}
    />
  );
}

/**
 * The trigger button inside its `Tooltip`, which shows the same words as its
 * accessible name on hover and focus: the faces carry no text. A forwardRef
 * component so Radix's `DropdownMenuTrigger asChild` reaches the `<button>`
 * through the tooltip, the way it does an `IconButton`.
 */
const StackTrigger = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { tooltip: string }
>(function StackTrigger({ tooltip, children, ...props }, ref) {
  return (
    <Tooltip content={tooltip}>
      <button ref={ref} type="button" {...props}>
        {children}
      </button>
    </Tooltip>
  );
});
