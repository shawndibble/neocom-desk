/**
 * The "This Character / All Characters / specific characters" picker shared
 * by the cross-character Wallet Balance and Industry Active Jobs views, and
 * by the synced default in Settings (issue #607). Same `DropdownMenu` +
 * checkbox-per-character shape `MoonMiningTax.tsx` already ships for its
 * Character filter, plus the "This Character" quick-select that page
 * doesn't offer — every existing caller of that pattern only ever needed
 * "all or a hand-picked subset."
 *
 * "This Character" emits the literal `'current'` (`CharacterFilterValue`),
 * not a `Set` frozen to whichever Character happens to be active at click
 * time — so a Settings default of "This Character" keeps meaning "whichever
 * one I'm on," not "always character #91," and a page-level picker keeps
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
 * Two callers sit outside that rule for reasons of their own. Settings' copy
 * is an account-level synced default rather than a filter over anything on
 * screen, so it renders with one Character too. `OpenOrdersPanel` keeps its
 * copy in a bordered body strip alongside the rest of that panel's filter
 * chips, in a `Panel` whose header carries no title for it to sit beside.
 */
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { toggleFilterMember } from '@/lib/multiSelectFilter';
import { useResolvedCharacterFilter, type CharacterFilterValue } from './characterFilterValue';

export interface CharacterFilterCandidate {
  characterId: number;
  characterName: string;
}

export interface CharacterFilterControlProps {
  characters: readonly CharacterFilterCandidate[];
  /** Null with no active Character — the "This Character" quick-select has nothing to name and is omitted. */
  activeCharacterId: number | null;
  value: CharacterFilterValue;
  onChange: (next: CharacterFilterValue) => void;
}

export function CharacterFilterControl({
  characters,
  activeCharacterId,
  value,
  onChange,
}: CharacterFilterControlProps) {
  const { t } = useTranslation();
  const resolved = useResolvedCharacterFilter(value, activeCharacterId);
  // Reads "This character" for the literal `'current'` and for a hand-picked
  // subset that happens to resolve to just the active Character too — how it
  // got there doesn't change what the trigger should say.
  const isCurrentOnly =
    value === 'current' ||
    (activeCharacterId !== null &&
      resolved !== 'all' &&
      resolved.size === 1 &&
      resolved.has(activeCharacterId));

  const label =
    resolved === 'all'
      ? t('character.filter.allCharacters')
      : isCurrentOnly
        ? t('character.filter.thisCharacter')
        : t('character.filter.selectedCount', { count: resolved.size });

  function toggleCharacter(characterId: number) {
    onChange(
      toggleFilterMember(
        resolved,
        characterId,
        characters.map((c) => c.characterId)
      )
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">{label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {activeCharacterId !== null && (
          <DropdownMenuItem onSelect={() => onChange('current')}>
            {t('character.filter.thisCharacter')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onChange('all')}>
          {t('character.filter.allCharacters')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {characters.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.characterId}
            checked={resolved === 'all' || resolved.has(c.characterId)}
            // Without this the menu closes on the first toggle, which makes a
            // multi-select take one round trip per character
            // (`CalendarKindFilterMenu`'s precedent).
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggleCharacter(c.characterId)}
          >
            {c.characterName}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
