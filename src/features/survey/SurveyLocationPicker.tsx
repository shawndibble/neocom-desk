/**
 * The Survey's location box: type a system, an NPC station or a structure and
 * pick it from the list under the box. Emptying the box clears the location, and
 * a name no result carries can be kept as typed: the last row offers it as a manual
 * location (free text, no id, so no waypoint).
 *
 * Systems, stations and the structures this device already knows are matched
 * locally while typing; any other structure needs ESI's name search (three
 * letters, debounced), and only for a Character whose token carries the search
 * scope, so everyone else still gets the rest without a request that would 403.
 * The box shows the picked place's name until the pilot types.
 *
 * A place named exactly what was typed (case and punctuation aside) leads the
 * list highlighted, so Enter takes it, and a pasted name that matches one is
 * picked outright. While a structure search is out, its row says so, the
 * earlier structures that still match stay listed, and Enter waits for the
 * answer rather than settling for the typed text as a manual location.
 */
import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Button, LiveStatus, Spinner, TextInput } from '@/components/ui';
import { activeOptionClassName } from '@/components/ui/controlStyles';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { ESI_REGISTRY } from '@/esi/registry';
import { useSolarSystemList } from '@/features/route/useSolarSystems';
import { moveHighlight, COMBOBOX_NAV_KEYS, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { LOOKUP_DEBOUNCE_MS } from '@/lib/useDebouncedValue';
import { loadNpcStations } from '@/sde/loadMarketSde';
import type { NpcStationEntry } from '@/sde/marketTypes';
import {
  isExactPlace,
  manualPlaceOption,
  matchesPlace,
  mergeStructures,
  MIN_STRUCTURE_SEARCH_LENGTH,
  rankExactFirst,
  searchCachedStructures,
  searchLocalPlaces,
  searchStructures,
  type SurveyPlace,
} from './surveyPlaces';

const SEARCH_SCOPE = ESI_REGISTRY.getCharacterSearch.scope;

export function SurveyLocationPicker({
  value,
  characterId,
  onPick,
}: {
  value: { id: number | null; name: string } | null;
  characterId: number;
  /** A place, or `null` when the pilot emptied the box. */
  onPick: (place: SurveyPlace | null) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const granted = useGrantedScopes();
  // `null` shows the picked place's name; a typed string (even empty) is a search in progress.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [stations, setStations] = useState<readonly NpcStationEntry[]>([]);
  const [knownStructures, setKnownStructures] = useState<(query: string) => SurveyPlace[]>(
    () => () => []
  );
  const [structureHits, setStructureHits] = useState<{ key: string; places: SurveyPlace[] } | null>(
    null
  );
  // The text Enter was pressed on while a structure search was out, answered once it lands.
  const [heldEnter, setHeldEnter] = useState<string | null>(null);
  // The text a paste put in the box, picked outright when a place carries exactly that name.
  const [pasted, setPasted] = useState<string | null>(null);
  const pasting = useRef(false);
  const { systems, failed: systemsFailed, retry: retrySystems } = useSolarSystemList(open);
  // Retry's note unmounts when the read restarts: focus waits on the field wrapper.
  const [wrapRef, , holdRetryFocus] = useRetryFocus(
    systemsFailed ? 'failed' : systems === null ? 'busy' : 'ok',
    'systems'
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadNpcStations()
      .catch(() => [])
      .then((entries) => {
        if (!cancelled) setStations(entries);
      });
    void searchCachedStructures()
      .catch(() => () => [])
      .then((search) => {
        if (!cancelled) setKnownStructures(() => search);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const typed = query?.trim() ?? '';
  const canSearch = granted !== undefined && granted.includes(SEARCH_SCOPE);
  const searchText = canSearch && typed.length >= MIN_STRUCTURE_SEARCH_LENGTH ? typed : '';
  // Hits belong to the Character that searched, so another one's never pass for current.
  const searchKey = searchText === '' ? '' : `${characterId}:${searchText}`;
  useEffect(() => {
    if (searchKey === '') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchStructures(characterId, searchText, controller.signal)
        .catch(() => [])
        .then((places) => {
          if (!controller.signal.aborted) setStructureHits({ key: searchKey, places });
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchKey, searchText, characterId]);

  const searching = searchKey !== '' && structureHits?.key !== searchKey;

  const places = useMemo(() => {
    const local = searchLocalPlaces(systems ?? [], stations, typed);
    // Until the search for this text lands, the last one's hits that still match stand in.
    const found =
      searchKey === '' || structureHits === null
        ? []
        : structureHits.key === searchKey
          ? structureHits.places
          : structureHits.places.filter((place) => matchesPlace(place.name, typed));
    const results = rankExactFirst(
      [...local, ...mergeStructures(knownStructures(typed), found)],
      typed
    );
    const manual = manualPlaceOption(results, typed);
    return manual === null ? results : [...results, manual];
  }, [systems, stations, knownStructures, typed, structureHits, searchKey]);

  // The manual row carries the typed text too, so it never counts as the match.
  const lead = places[0];
  const exact =
    lead !== undefined && lead.kind !== 'manual' && isExactPlace(lead, typed) ? lead : undefined;
  // The keyboard's choice, else the exact match: the option Enter takes.
  const active = highlight ?? (exact === undefined ? null : 0);

  /** What Enter takes: the active option, or typed text nothing matched as a manual location. */
  function enterPick(): SurveyPlace | undefined {
    if (active !== null) return places[active];
    return places.length === 1 ? places.find((place) => place.kind === 'manual') : undefined;
  }

  function choose(place: SurveyPlace) {
    onPick(place);
    setQuery(null);
    setOpen(false);
    setHighlight(null);
    setHeldEnter(null);
    setPasted(null);
  }

  // A paste naming a place picks it; an Enter held for the search is answered once it lands.
  const pastedPick = pasted !== null && pasted === query ? exact : undefined;
  const heldAnswered = heldEnter !== null && heldEnter === query && !searching;
  const autoPick = useEffectEvent(() => {
    const place = pastedPick ?? (heldAnswered ? enterPick() : undefined);
    if (place !== undefined) choose(place);
    // Nothing to take (several hits, no exact one): the pilot picks from the list.
    else if (heldAnswered) setHeldEnter(null);
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- answers an async arrival (the cache read or ESI's search), not a render-time derivation
    if (pastedPick !== undefined || heldAnswered) autoPick();
  }, [pastedPick, heldAnswered]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (COMBOBOX_NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      // Moving the highlight takes back a held Enter: the pilot is choosing again.
      setHeldEnter(null);
      setHighlight(moveHighlight(event.key as ComboboxNavKey, active, places.length));
    } else if (event.key === 'Enter') {
      const place = enterPick();
      if (active === null && searching && query !== null) {
        // A structure may yet carry this name: answer Enter once the search lands.
        event.preventDefault();
        setHeldEnter(query);
      } else if (place !== undefined) {
        event.preventDefault();
        choose(place);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery(null);
      setHeldEnter(null);
    }
  }

  const showList = open && (places.length > 0 || searching);

  return (
    <div
      ref={wrapRef}
      tabIndex={-1}
      className="relative min-w-0 flex-1 basis-64 focus:outline-none"
    >
      <LiveStatus>{open && systemsFailed ? t('jumpRange.systemsFailed') : ''}</LiveStatus>
      <TextInput
        size="sm"
        role="combobox"
        aria-label={t('survey.info.location')}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={!showList || active === null ? undefined : `${listId}-${active}`}
        autoComplete="off"
        placeholder={t('survey.info.locationPlaceholder')}
        value={query ?? value?.name ?? ''}
        onPaste={() => {
          pasting.current = true;
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlight(null);
          setHeldEnter(null);
          setPasted(pasting.current ? event.target.value : null);
          pasting.current = false;
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          // Emptying the box is how a location is cleared.
          if (query !== null && query.trim() === '' && value !== null) onPick(null);
          setQuery(null);
        }}
        onKeyDown={onKeyDown}
      />
      {open && systemsFailed && (
        // System names can't be searched without the list; stations and typed text still work.
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="mt-1 flex flex-wrap items-center gap-2 text-xs text-warning"
        >
          <span>{t('jumpRange.systemsFailed')}</span>
          <Button
            size="sm"
            onClick={() => {
              holdRetryFocus();
              retrySystems();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      {showList && (
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-20 mt-1 flex max-h-72 flex-col overflow-auto rounded-xs border border-line bg-panel py-1 shadow-lg"
        >
          <ul id={listId} role="listbox" className="flex flex-col">
            {places.map((place, index) => (
              <li
                key={`${place.kind}-${place.id ?? place.name}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cx(
                  'flex cursor-pointer items-baseline justify-between gap-3 px-2 py-1 hover:bg-panel-2 touch:min-h-9 touch:items-center',
                  index === active && `bg-panel-2 ${activeOptionClassName}`
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {place.kind === 'manual'
                    ? t('survey.info.useManual', { name: place.name })
                    : place.name}
                  {place.security !== undefined && (
                    <SecurityStatus security={place.security} className="ml-1" />
                  )}
                </span>
                <span className="shrink-0 text-xs text-text-dim">
                  {t(`survey.info.kind.${place.kind}`)}
                </span>
              </li>
            ))}
          </ul>
          {searching && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-text-dim">
              <Spinner size="sm" label={t('survey.info.searchingStructures')} />
              <span aria-hidden="true">{t('survey.info.searchingStructures')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
