import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Disclosure, SearchInput, Spinner } from '@/components/ui';
import { cx } from '@/lib/cx';
import { beginEveLogin } from '@/app/loginFlow';
import { ESI_REGISTRY } from '@/esi/registry';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryActivity } from '@/engine/industry/types';
import { buildLocationLabel } from './buildLocationLabel';
import { moveHighlight, type ComboboxNavKey } from './comboboxNav';
import { MIN_SEARCH_LENGTH, searchBuildLocations } from './searchBuildLocations';
import type { BuildLocationOption } from './buildLocations';

const LISTBOX_ID = 'build-location-listbox';
const optionId = (structureId: number) => `build-location-option-${structureId}`;

interface BuildLocationPickerProps {
  /** What the plan is set to right now, already translated. Always the plan's own values. */
  summary: string;
  /** The plan's own location, already labelled. Shown whenever no search is in progress. */
  selectedLabel: string | null;
  /** Facility and build system — revealed by "Override". */
  children: ReactNode;
  onPick: (option: BuildLocationOption) => void;
  /** Which job the plan runs, so the search offers only places that can host it (issue #460). */
  activity: IndustryActivity;
}

/** Read off the registry rather than spelled out here — this file stays hand-edit-free. */
const SEARCH_SCOPE = ESI_REGISTRY.getCharacterSearch.scope;

/** Long enough that a typed word is one request, short enough to feel live. */
const DEBOUNCE_MS = 300;

/**
 * Finds the station or structure the job runs in, and fills the fields that
 * follow from it: facility preset, build system, and the security band the
 * system settles.
 *
 * Those fields are behind "Override" rather than beside the box, because the
 * search answers all three and a pilot who has a structure in mind should not
 * have to translate it into a facility and a system by hand. The line under the
 * box states what the plan is actually set to, so nothing is hidden — only
 * folded. The link is always there, including for a Character whose token
 * predates the search scope: the fields are the whole feature for them.
 *
 * A search rather than a list, because the list ESI can give us is the wrong
 * one: a corporation's own structures leave out the alliance tower, the rented
 * Raitaru and every NPC station. `GET /characters/{id}/search` is the only
 * route that finds a structure by name, and it returns what this Character can
 * actually dock at — CCP's ACL, not ours.
 *
 * **The box states the plan's own stored pick** (`BuildPlanRecord.buildLocationId`),
 * so it survives a reload rather than blanking the moment a choice fills the
 * fields below it.
 *
 * Its scope is in the base grant, so a Character added from now on can search
 * straight away. One added *before* it existed holds a token without it —
 * `/industry` stays UNGATED, so they keep the whole route and are offered the
 * re-auth here, beside the control it unlocks, rather than behind a banner
 * across a page that otherwise works.
 */
export function BuildLocationPicker({
  summary,
  selectedLabel,
  children,
  onPick,
  activity,
}: BuildLocationPickerProps) {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const [overriding, setOverriding] = useState(false);
  // `null` means "not searching" — the box then reads the plan's own pick
  // rather than a typed fragment, which is what makes the choice outlive a
  // reload. A typed empty string is a different state: the pilot cleared the
  // box themselves, so it stays cleared until they pick again.
  const [query, setQuery] = useState<string | null>(null);
  // What the pilot just chose, held until the plan comes back carrying it:
  // the parent's write is a Dexie round-trip, and without this the box would
  // state the *previous* location for a frame after the click.
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<BuildLocationOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Which result Arrow/Home/End has highlighted, without moving DOM focus off
  // the input — the input stays the list's one tab stop.
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  // Escape hides an already-fetched list without re-searching: the query is
  // untouched, so nothing in the effect below reruns until it changes.
  const [dismissed, setDismissed] = useState(false);
  // Distinct from "no results": a 403, a 500 and being offline all used to
  // render "Nothing found. Try more of the name.", which sends the pilot off
  // retyping a name that was never the problem.
  const [failed, setFailed] = useState(false);

  // In the base grant, so every Character signing in from now on has it. A
  // Character who signed in before it existed holds a token without it, and
  // gets the re-auth offer below rather than a control that would 403.
  const canSearch = granted !== undefined && granted.includes(SEARCH_SCOPE);

  // What the effect is actually allowed to search for: empty until the query
  // clears ESI's three-character floor and the scope is in hand. Derived
  // during render, and the two display states reset with it — the same
  // adjust-during-render idiom `BuildPlanDetail` uses for its snapshot key,
  // and the reason nothing here sets state from inside an effect body.
  const trimmed = query?.trim() ?? '';
  const searchKey = canSearch && trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : '';
  const [prevSearchKey, setPrevSearchKey] = useState(searchKey);
  if (prevSearchKey !== searchKey) {
    setPrevSearchKey(searchKey);
    setResults(null);
    setFailed(false);
    setSearching(searchKey !== '');
    setHighlightedIndex(null);
    setDismissed(false);
  }

  // Dropped as soon as the plan answers — including when it answers with
  // nothing, which is what a manual facility or build-system edit leaves
  // behind. Adjusted during render for the same reason `searchKey` is.
  const [prevSelectedLabel, setPrevSelectedLabel] = useState(selectedLabel);
  if (prevSelectedLabel !== selectedLabel) {
    setPrevSelectedLabel(selectedLabel);
    setPicked(null);
  }

  // Only the newest query may write results: ESI answers out of order, and a
  // three-letter search started first can land after the five-letter one.
  const latest = useRef(0);
  useEffect(() => {
    if (searchKey === '' || characterId === null) return;
    const ticket = ++latest.current;
    // Aborted on cleanup as well as ignored: without it a superseded query
    // still finishes its whole fan-out of per-hit lookups.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchBuildLocations(characterId, searchKey, activity, controller.signal)
        .then((found) => {
          if (ticket !== latest.current) return;
          setResults(found);
          setSearching(false);
        })
        .catch(() => {
          if (ticket !== latest.current || controller.signal.aborted) return;
          setFailed(true);
          setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchKey, characterId, activity]);

  // Narrowed rather than a plain boolean: every read below needs the array
  // itself, and TS can carry the `results !== null` check through this
  // ternary into the non-null branch, so nothing downstream needs `results!`.
  const openResults =
    !dismissed && !searching && results !== null && results.length > 0 ? results : null;

  // Shared with the plan's own stored label, so a pick cannot change wording
  // as the write lands. Feeds the row, the sr-only highlight announcement and
  // `picked` below.
  function optionLabel(option: BuildLocationOption) {
    return buildLocationLabel(option.name, option.facility, option.systemName, t);
  }

  function pick(option: BuildLocationOption) {
    onPick(option);
    // The box states the place chosen, not the fragment typed to find it:
    // `picked` covers the gap until the plan's own label arrives. Clearing
    // the query also resets results/highlight/dismissed through the
    // searchKey block above, the same reset every other query edit takes.
    setQuery(null);
    setPicked(optionLabel(option));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (openResults === null) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        e.preventDefault();
        setHighlightedIndex((current) =>
          moveHighlight(e.key as ComboboxNavKey, current, openResults.length)
        );
        break;
      case 'Enter':
        if (highlightedIndex !== null) {
          e.preventDefault();
          pick(openResults[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setDismissed(true);
        setHighlightedIndex(null);
        break;
    }
  }

  // Named for the sr-only status region below: count alone on open, plus the
  // highlighted row's own label once one is picked out — the two things
  // "Arrow keys move a highlighted option ... a screen reader announces the
  // option count and the highlighted option" (#505) asks a screen reader to
  // say.
  const highlightedOption =
    openResults !== null && highlightedIndex !== null ? openResults[highlightedIndex] : null;
  const highlightedName = highlightedOption ? optionLabel(highlightedOption) : null;

  const searchBox =
    granted === undefined ? null : canSearch ? (
      <div className="relative flex flex-col gap-1">
        <label htmlFor="build-plan-location">{t('industry.buildLocation')}</label>
        <SearchInput
          id="build-plan-location"
          value={query ?? picked ?? selectedLabel ?? ''}
          placeholder={t('industry.buildLocationPlaceholder')}
          onChange={(e) => setQuery(e.target.value)}
          // Abandoning the search gives the box back to the plan. Escape
          // keeps the typed text — a near-miss is still there to correct —
          // but once focus is gone there is nothing to correct. Result rows
          // cancel their own mousedown, so clicking one never blurs first.
          onBlur={() => setQuery(null)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={openResults !== null}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={
            highlightedOption ? optionId(highlightedOption.structureId) : undefined
          }
        />
        <span role="status" aria-live="polite" className="sr-only">
          {!searching &&
            !failed &&
            results !== null &&
            (highlightedName
              ? t('industry.buildLocationHighlighted', {
                  count: results.length,
                  name: highlightedName,
                })
              : t('industry.buildLocationResultsCount', { count: results.length }))}
        </span>
        {searching && (
          <span className="flex items-center gap-1 text-text-dim">
            <Spinner size="sm" label={t('industry.buildLocationSearching')} />
          </span>
        )}
        {!searching && failed && (
          <span role="alert" className="text-danger">
            {t('industry.buildLocationFailed')}
          </span>
        )}
        {!searching && !failed && results !== null && results.length === 0 && (
          <span className="text-text-dim">{t('industry.buildLocationNoResults')}</span>
        )}
        {openResults !== null && (
          <ul
            id={LISTBOX_ID}
            role="listbox"
            className="max-h-56 overflow-y-auto rounded-xs border border-line bg-panel"
          >
            {openResults.map((option, index) => (
              <li
                key={option.structureId}
                id={optionId(option.structureId)}
                role="option"
                aria-selected={index === highlightedIndex}
                className={cx(
                  'flex cursor-pointer flex-col items-start gap-0.5 border-b border-line px-2 py-1.5 last:border-b-0',
                  index === highlightedIndex ? 'bg-panel-2' : 'hover:bg-panel-2'
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
              >
                <span className="truncate">{optionLabel(option)}</span>
                <span className="text-text-dim">
                  {t('industry.buildLocationDetail', {
                    facility: FACILITY_PRESETS[option.facility].name,
                    system: option.systemName,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    ) : (
      <div className="flex flex-col gap-1.5 rounded-xs border border-line p-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-text-dim">{t('industry.buildLocationGrantHint')}</span>
        <Button
          size="sm"
          onClick={() => void beginEveLogin({ characterId: characterId ?? undefined })}
        >
          {t('industry.buildLocationGrant')}
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {searchBox}

      <Disclosure
        label={t('industry.override')}
        trailing={summary}
        expanded={overriding}
        onToggle={() => setOverriding((open) => !open)}
        className="rounded-xs border border-line"
      >
        <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3">{children}</div>
      </Disclosure>
    </div>
  );
}
