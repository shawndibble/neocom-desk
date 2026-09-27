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
 * `IconButton size="sm"` uses, rather than a full-width text pill — the
 * active Character's own portrait for "current," the generic `AllCharacters`
 * glyph for "all." That box also absorbed the phone-only "whose data is
 * this" avatar `PageHeader` used to float in its own corner (#1764): with
 * this trigger already carrying that cue whenever a route offers the
 * filter, a second, separate avatar had nothing left to say. At `md` the
 * trigger is the usual text button; there is room for the words there.
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
import { useResolvedCharacterFilter, type CharacterFilterValue } from './characterFilterValue';

export interface CharacterFilterControlProps {
  /** Null with no active Character — `resolveCharacterFilter` then reads `'current'` as `'all'`, so the trigger and its "This character" option both fall away on their own. */
  activeCharacterId: number | null;
  value: CharacterFilterValue;
  onChange: (next: CharacterFilterValue) => void;
}

/**
 * The composite class list below is one element rather than `Button`'s or
 * `IconButton`'s own `size`/`variant` props: it needs a *different* box at
 * each breakpoint (a fixed `size-9` square below `md`, an auto-width text
 * pill at `md` and up) rather than either component's single fixed shape.
 * Each pair of conflicting utilities here is written mobile-first / `md:`
 * override, the same pattern `iconButtonClassName`'s own `size-11 md:size-9`
 * uses — never two unprefixed utilities for the same property, which is the
 * one ordering Tailwind does not promise to resolve predictably.
 */
const triggerClassName =
  'inline-flex shrink-0 items-center justify-center rounded-xs border border-line font-semibold ' +
  'tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-accent h-9 w-9 bg-panel-2 p-0 text-text-dim hover:border-line-bright ' +
  'hover:bg-panel-2 hover:text-text md:h-7 md:w-auto md:gap-1.5 md:bg-transparent md:px-2.5 ' +
  'md:text-[0.6875rem] md:text-text md:hover:bg-panel-2';

export function CharacterFilterControl({
  activeCharacterId,
  value,
  onChange,
}: CharacterFilterControlProps) {
  const { t } = useTranslation();
  const resolved = useResolvedCharacterFilter(value, activeCharacterId);
  const isAll = resolved === 'all';
  const label = isAll ? t('character.filter.allCharacters') : t('character.filter.thisCharacter');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label} className={triggerClassName}>
          <span aria-hidden="true" className="flex items-center justify-center md:hidden">
            {isAll || activeCharacterId === null ? (
              <Icon.AllCharacters size={ICON_SIZE.md} />
            ) : (
              <CharacterAvatar
                characterId={activeCharacterId}
                size="sm"
                loading="lazy"
                className="rounded-full"
              />
            )}
          </span>
          <span className="hidden md:inline">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuRadioGroup
          value={isAll ? 'all' : 'current'}
          onValueChange={(next) => onChange(next as CharacterFilterValue)}
        >
          {activeCharacterId !== null && (
            <DropdownMenuRadioItem value="current">
              {t('character.filter.thisCharacter')}
            </DropdownMenuRadioItem>
          )}
          <DropdownMenuRadioItem value="all">
            {t('character.filter.allCharacters')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
