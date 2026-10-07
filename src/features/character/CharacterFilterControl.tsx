/**
 * The "This Character / All Characters" toggle shared by the cross-character
 * Wallet Balance and Industry Active Jobs views, by Open Orders' character
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
 * Where it goes: in the `meta` slot of the panel it filters, beside that
 * panel's title, and not at all for a caller with one Character to offer —
 * see
 * `docs/context/decisions/20260908-192806-the-character-filter-rides-in-the-panel-header.md`.
 *
 * Below `md` the trigger is icon-only, fixed to the same box a sibling
 * `IconButton` uses in whichever row it rides in — `size="sm"` (the panel
 * `meta` hosts: Active Jobs, Open Orders, Mining Tax) by default, `size="md"`
 * where a `PageHeader`'s own `actions` cluster sits at its default (larger)
 * touch tier instead (Assets, Mining Tax Overview) — rather than a
 * full-width text pill. The active Character's own portrait for "current,"
 * the generic `AllCharacters` glyph for "all." That box also absorbed the
 * phone-only "whose data is this" avatar `PageHeader` used to float in its
 * own corner (#1764): with this trigger already carrying that cue whenever a
 * route offers the filter, a second, separate avatar had nothing left to
 * say. At `md` the trigger is the usual text button regardless of `size`;
 * there is room for the words there.
 */
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { ICON_SIZE } from '@/components/ui/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import {
  fieldBaseClassName,
  fieldSizeClassName,
  focusRingClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import { useResolvedCharacterFilter, type CharacterFilterValue } from './characterFilterValue';

export interface CharacterFilterControlProps {
  /** Null with no active Character — `resolveCharacterFilter` then reads `'current'` as `'all'`, so the trigger and its "This character" option both fall away on their own. */
  activeCharacterId: number | null;
  value: CharacterFilterValue;
  onChange: (next: CharacterFilterValue) => void;
  /**
   * The sibling touch tier this trigger's icon-only phone box must match,
   * mirroring `IconButtonSize`'s two below-`md` values (`size-9`/`size-11`) —
   * not the full `IconButtonSize` (there is no `'row'` tier here). `'sm'`
   * (default) for a panel's own `meta` row, where the `IconButton`s beside it
   * (Active Jobs, Open Orders, Mining Tax) are themselves `size="sm"`.
   * `'md'` for a `PageHeader`'s `meta`, where that header's own `actions`
   * cluster sits at `IconButton`'s default (larger) tier instead (Assets,
   * Mining Tax Overview) — see `PageHeader`'s own doc comment.
   */
  size?: 'sm' | 'md';
  /**
   * `'icon'` (default): the compact header trigger above. `'field'`: a form
   * control for a settings row — field chrome (§6c "a box sized like a field")
   * with the current value as text and a trailing `CaretDown` at every width.
   * The icon-only trigger has no label or caret and, where the portrait does
   * not load, reads as a blank square; it only suits a header row where the
   * panel title says what it filters.
   */
  variant?: 'icon' | 'field';
  /** `variant="field"` only: the setting's name. The button's accessible name becomes "<name>: <value>", since the value alone doesn't say what is being set. */
  triggerLabel?: string;
  /** How many Characters "All" covers. Shown in its label ("All characters · 4"), the choosable form of `CharacterScopeReadout`. */
  characterCount?: number;
}

/**
 * The two below-`md` box sizes this trigger can be fixed to, keyed the same
 * way `CharacterFilterControlProps.size` is. Plain `h-*`/`w-*` rather than
 * `IconButton`'s own `size-*` (which bakes width and height into one
 * utility): this trigger also needs an auto-width text pill at `md` and up,
 * and overriding just the `md:` width half of a `size-*` utility would mean
 * two `md:`-prefixed utilities fighting over the same breakpoint — the one
 * ordering Tailwind does not promise to resolve predictably, the same reason
 * two unprefixed utilities for one property are avoided elsewhere in this
 * file. At `md` the trigger is always the same compact text pill regardless
 * of this tier (`md:h-7`, in `triggerBaseClassName` below, unconditionally)
 * — so only the phone-width half varies here.
 */
const TRIGGER_BOX: Record<'sm' | 'md', string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
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
  `md:h-7 bg-panel-2 p-0 text-text-dim hover:border-line-bright ` +
  `hover:bg-panel-2 hover:text-text md:w-auto md:gap-1.5 md:bg-transparent md:px-2.5 ` +
  `md:text-[0.6875rem] md:text-text md:hover:bg-panel-2`;

export function CharacterFilterControl({
  activeCharacterId,
  value,
  onChange,
  size = 'sm',
  variant = 'icon',
  triggerLabel,
  characterCount,
}: CharacterFilterControlProps) {
  const { t } = useTranslation();
  const resolved = useResolvedCharacterFilter(value, activeCharacterId);
  const isAll = resolved === 'all';
  const allLabel =
    characterCount === undefined
      ? t('character.filter.allCharacters')
      : t('character.scope.all', { count: characterCount });
  const label = isAll ? allLabel : t('character.filter.thisCharacter');
  const options = (
    <DropdownMenuContent align="start" className="w-48">
      <DropdownMenuRadioGroup
        value={isAll ? 'all' : 'current'}
        onValueChange={(next) => onChange(next as CharacterFilterValue)}
      >
        {activeCharacterId !== null && (
          <DropdownMenuRadioItem value="current">
            {t('character.filter.thisCharacter')}
          </DropdownMenuRadioItem>
        )}
        <DropdownMenuRadioItem value="all">{allLabel}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
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
          aria-label={label}
          className={`${TRIGGER_BOX[size]} ${triggerBaseClassName}`}
        >
          <span aria-hidden="true" className="flex items-center justify-center md:hidden">
            {isAll || activeCharacterId === null ? (
              <Icon.AllCharacters size={ICON_SIZE.md} />
            ) : (
              <CharacterAvatar
                characterId={activeCharacterId}
                size={size === 'md' ? 'md' : 'sm'}
                loading="lazy"
                className="rounded-full"
              />
            )}
          </span>
          <span className="hidden md:inline">{label}</span>
          <Icon.Expanded size={ICON_SIZE.sm} aria-hidden="true" className="hidden md:block" />
        </button>
      </DropdownMenuTrigger>
      {options}
    </DropdownMenu>
  );
}
