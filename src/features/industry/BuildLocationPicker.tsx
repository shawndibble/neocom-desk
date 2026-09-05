import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SearchInput, Spinner } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { scopesForGroup } from '@/esi/scopes';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import { MIN_SEARCH_LENGTH, searchBuildLocations } from './searchBuildLocations';
import type { BuildStructureOption } from './buildStructures';

interface BuildLocationPickerProps {
  onPick: (option: BuildStructureOption) => void;
}

/** Derived from the registry, like `CorpGrantPrompt` — this file stays hand-edit-free. */
const SEARCH_GROUP_SCOPES = scopesForGroup('search');

/** Long enough that a typed word is one request, short enough to feel live. */
const DEBOUNCE_MS = 300;

/**
 * Finds the station or structure the job runs in, and fills the fields that
 * follow from it: facility preset, build system, and the security band the
 * system settles.
 *
 * A search rather than a list, because the list ESI can give us is the wrong
 * one: a corporation's own structures leave out the alliance tower, the rented
 * Raitaru and every NPC station. `GET /characters/{id}/search` is the only
 * route that finds a structure by name, and it returns what this Character can
 * actually dock at — CCP's ACL, not ours.
 *
 * **Fill-once, by decision.** Nothing records which place was picked. Every
 * field on screen reads the plan's own values, so nothing can drift from them,
 * and a later edit is just an edit rather than a conflict with a stored link.
 *
 * The one scope it needs is opt-in (`search` group): the prompt appears here,
 * at the moment the pilot asks for the search, and never on anyone's sign-in
 * consent screen.
 */
export function BuildLocationPicker({ onPick }: BuildLocationPickerProps) {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BuildStructureOption[] | null>(null);
  const [searching, setSearching] = useState(false);

  const canSearch =
    granted !== undefined && SEARCH_GROUP_SCOPES.every((scope) => granted.includes(scope));

  // What the effect is actually allowed to search for: empty until the query
  // clears ESI's three-character floor and the scope is in hand. Derived
  // during render, and the two display states reset with it — the same
  // adjust-during-render idiom `BuildPlanDetail` uses for its snapshot key,
  // and the reason nothing here sets state from inside an effect body.
  const trimmed = query.trim();
  const searchKey = canSearch && trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : '';
  const [prevSearchKey, setPrevSearchKey] = useState(searchKey);
  if (prevSearchKey !== searchKey) {
    setPrevSearchKey(searchKey);
    setResults(null);
    setSearching(searchKey !== '');
  }

  // Only the newest query may write results: ESI answers out of order, and a
  // three-letter search started first can land after the five-letter one.
  const latest = useRef(0);
  useEffect(() => {
    if (searchKey === '' || characterId === null) return;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      void searchBuildLocations(characterId, searchKey)
        .then((found) => {
          if (ticket !== latest.current) return;
          setResults(found);
          setSearching(false);
        })
        .catch(() => {
          if (ticket !== latest.current) return;
          setResults([]);
          setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchKey, characterId]);

  if (granted === undefined) return null;

  if (!canSearch) {
    return (
      <div className="flex flex-col gap-1.5 rounded-xs border border-line p-2 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span className="text-text-dim">{t('industry.buildLocationGrantHint')}</span>
        <Button
          size="sm"
          onClick={() =>
            void beginEveLogin({ characterId: characterId ?? undefined, groups: ['search'] })
          }
        >
          {t('industry.buildLocationGrant')}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1 text-xs">
      <label htmlFor="build-plan-location">{t('industry.buildLocation')}</label>
      <SearchInput
        id="build-plan-location"
        value={query}
        placeholder={t('industry.buildLocationPlaceholder')}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searching && (
        <span className="flex items-center gap-1 text-text-dim">
          <Spinner size="sm" label={t('industry.buildLocationSearching')} />
        </span>
      )}
      {!searching && results !== null && results.length === 0 && (
        <span className="text-text-dim">{t('industry.buildLocationNoResults')}</span>
      )}
      {!searching && results !== null && results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-xs border border-line bg-panel">
          {results.map((option) => (
            <li key={option.structureId} className="border-b border-line last:border-b-0">
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left hover:bg-panel-2"
                onClick={() => {
                  onPick(option);
                  setQuery('');
                  setResults(null);
                }}
              >
                <span className="truncate">
                  {option.name ??
                    t('industry.buildLocationUnnamed', {
                      facility: FACILITY_PRESETS[option.facility].name,
                      system: option.systemName,
                    })}
                </span>
                <span className="text-text-dim">
                  {t('industry.buildLocationDetail', {
                    facility: FACILITY_PRESETS[option.facility].name,
                    system: option.systemName,
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
