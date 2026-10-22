/**
 * The "This Character / All Characters" toggle shared by the cross-character
 * Wallet and Assets pages (in their `PageHeader` `scope`), the Industry Active Jobs view, by Open Orders' character
 * strip, and by the synced default in Settings (issue #607).
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
 * Partial coverage: with `missingNames` and the value "all", the label stays
 * "All characters" (the trigger only ever reads This character / All
 * characters / Corporation), a warning dot marks the trigger at every width,
 * the accessible name adds "Not included: …", and the open menu names who is
 * missing in a non-interactive note. `loading` swaps the glyph for a
 * `Spinner` in the same box, so the trigger never changes size mid-load.
 *
 * Below `lg` the trigger is icon-only, fixed to the same box a sibling
 * `IconButton` uses in whichever row it rides in — `size="sm"` (the panel
 * `meta` hosts: Active Jobs, Open Orders, Mining Tax) by default, `size="md"`
 * where a `PageHeader`'s own `actions` cluster sits at its default (larger)
 * touch tier instead (Mining Tax Overview) — rather than a
 * full-width text pill. The active Character's own portrait for "current,"
 * the generic `AllCharacters` glyph for "all." That box also absorbed the
 * phone-only "whose data is this" avatar `PageHeader` used to float in its
 * own corner (#1764): with this trigger already carrying that cue whenever a
 * route offers the filter, a second, separate avatar had nothing left to
 * say. From `lg` up the trigger is a text pill at its tier's height that
 * keeps the same glyph in front of the words — glyph, words, caret —
 * with the header `IconButton`'s border, fill and hover, so it reads as one
 * of the header's controls.
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
import { useContext } from 'react';
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
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { Spinner } from '@/components/ui/Spinner';
import { CorporationLogoGlyph } from './CorporationLogoGlyph';
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
   * The sibling touch tier this trigger's icon-only phone box must match,
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
   * `'icon'` (default): the compact header trigger above. `'field'`: a form
   * control for a settings row — field chrome (§6c "a box sized like a field")
   * with the current value as text and a trailing `CaretDown` at every width.
   * Below `lg` the icon-only trigger has no label or caret and, where the portrait does
   * not load, reads as a blank square; it only suits a header row where the
   * panel title says what it filters.
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
 * The two box sizes this trigger can be fixed to, keyed the same way
 * `CharacterFilterControlProps.size` is. Only the height is set, from the
 * tier (`controlHeightClassName`, which already steps down at `md` and back
 * up for `touch:`); `aspect-square` makes the width follow it, so below `lg`
 * the trigger is exactly the square a sibling `IconButton` is at every width
 * and pointer. Not `IconButton`'s own `size-*`: from `lg` up the trigger is an
 * auto-width text pill (`lg:aspect-auto`), and a `size-*` would need its
 * width half overridden per breakpoint and per `touch:`, an ordering Tailwind
 * does not promise to resolve predictably.
 */
const TRIGGER_BOX: Record<'sm' | 'md', string> = {
  sm: `aspect-square lg:aspect-auto ${controlHeightClassName.sm}`,
  md: `aspect-square lg:aspect-auto ${controlHeightClassName.md}`,
};

/**
 * The rest of the composite class list is one element rather than `Button`'s
 * or `IconButton`'s own `size`/`variant` props for the same width-coupling
 * reason `TRIGGER_BOX` is: the default-tone ghost colors below are
 * `iconButtonClassName`'s own cascade, copied rather than composed because
 * composing it would pull in its coupled `size-*` too.
 */
const triggerBaseClassName =
  `inline-flex shrink-0 items-center justify-center rounded-xs border border-line font-semibold ` +
  `tracking-widest uppercase ${interactiveClassName} ${focusRingClassName} ` +
  `bg-panel-2 p-0 text-text-dim hover:border-line-bright hover:text-text active:bg-panel ` +
  `lg:gap-1.5 lg:px-2.5 lg:text-[0.6875rem]`;

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            isPartial ? t('character.scope.triggerPartial', { label, missing: missingNote }) : label
          }
          aria-busy={loading || undefined}
          className={`relative ${TRIGGER_BOX[size]} ${triggerBaseClassName}`}
        >
          {/* The glyph at every width: the whole trigger below `lg` (an `IconButton`-sized 20px glyph from `md`), the pill's leading icon from `lg` up (a fixed 20px slot, so a spinner swap never resizes the pill). */}
          <span className="flex shrink-0 items-center justify-center md:size-5">
            {loading ? (
              spinner
            ) : (
              <span aria-hidden="true" className="flex items-center justify-center">
                {isCorporation ? (
                  <CorporationLogoGlyph
                    characterId={activeCharacterId}
                    size={size === 'md' ? 'md' : 'sm'}
                    className="md:size-5"
                  />
                ) : isAll || activeCharacterId === null ? (
                  <Icon.AllCharacters size={ICON_SIZE.md} />
                ) : (
                  <CharacterAvatar
                    characterId={activeCharacterId}
                    size={size === 'md' ? 'md' : 'sm'}
                    loading="lazy"
                    className="rounded-full md:size-5"
                  />
                )}
              </span>
            )}
          </span>
          <span className="hidden lg:inline">{label}</span>
          <Icon.Expanded size={ICON_SIZE.sm} aria-hidden="true" className="hidden lg:block" />
          {isPartial && (
            // Every width: the label never says "partial", so the dot is the visible cue.
            <span
              data-partial-dot
              aria-hidden="true"
              className="absolute -top-1 -right-1 size-2 rounded-full bg-warning ring-2 ring-bg"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      {options}
    </DropdownMenu>
  );
}
