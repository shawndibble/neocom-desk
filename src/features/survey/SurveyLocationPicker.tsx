/**
 * The Survey's location box: type a system, an NPC station or a structure and
 * pick it from the list under the box. Emptying the box clears the location.
 *
 * Systems and stations are matched off the local snapshot while typing; a
 * structure needs ESI's name search (three letters, debounced), and only for a
 * Character whose token carries the search scope, so everyone else still gets
 * systems and stations without a request that would 403. The box shows the
 * picked place's name until the pilot types.
 */
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { SecurityStatus } from '@/components/SecurityStatus';
import { TextInput } from '@/components/ui';
import { ESI_REGISTRY } from '@/esi/registry';
import { useSolarSystems } from '@/features/route/useSolarSystems';
import { moveHighlight, COMBOBOX_NAV_KEYS, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { loadNpcStations } from '@/sde/loadMarketSde';
import type { NpcStationEntry } from '@/sde/marketTypes';
import {
  MIN_STRUCTURE_SEARCH_LENGTH,
  searchLocalPlaces,
  searchStructures,
  type SurveyPlace,
} from './surveyPlaces';

const SEARCH_SCOPE = ESI_REGISTRY.getCharacterSearch.scope;
const DEBOUNCE_MS = 300;

export function SurveyLocationPicker({
  value,
  characterId,
  onPick,
}: {
  value: { id: number; name: string } | null;
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
  const [structureHits, setStructureHits] = useState<{ key: string; places: SurveyPlace[] } | null>(
    null
  );
  const systems = useSolarSystems(open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadNpcStations()
      .catch(() => [])
      .then((entries) => {
        if (!cancelled) setStations(entries);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const typed = query?.trim() ?? '';
  const canSearch = granted !== undefined && granted.includes(SEARCH_SCOPE);
  const searchKey = canSearch && typed.length >= MIN_STRUCTURE_SEARCH_LENGTH ? typed : '';
  useEffect(() => {
    if (searchKey === '') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchStructures(characterId, searchKey, controller.signal)
        .catch(() => [])
        .then((places) => {
          if (!controller.signal.aborted) setStructureHits({ key: searchKey, places });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchKey, characterId]);

  const places = useMemo(() => {
    const local = searchLocalPlaces(systems ?? [], stations, typed);
    const found = structureHits?.key === searchKey ? structureHits.places : [];
    return [...local, ...found];
  }, [systems, stations, typed, structureHits, searchKey]);

  function choose(place: SurveyPlace) {
    onPick(place);
    setQuery(null);
    setOpen(false);
    setHighlight(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (COMBOBOX_NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, places.length));
    } else if (event.key === 'Enter') {
      if (highlight !== null && places[highlight]) {
        event.preventDefault();
        choose(places[highlight]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery(null);
    }
  }

  const showList = open && places.length > 0;
  const tagKey = { system: 'system', station: 'station', structure: 'structure' } as const;

  return (
    <div className="relative min-w-0 flex-1 basis-64">
      <TextInput
        size="sm"
        role="combobox"
        aria-label={t('survey.info.location')}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={highlight === null ? undefined : `${listId}-${highlight}`}
        autoComplete="off"
        placeholder={t('survey.info.locationPlaceholder')}
        value={query ?? value?.name ?? ''}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlight(null);
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
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 flex max-h-72 flex-col overflow-auto rounded-xs border border-line bg-panel-2 py-1 shadow-lg"
        >
          {places.map((place, index) => (
            <li
              key={`${place.kind}-${place.id}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlight}
              className={cx(
                'flex cursor-pointer items-baseline justify-between gap-3 px-2 py-1 hover:bg-panel touch:min-h-11 touch:items-center',
                index === highlight && 'bg-panel'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(place)}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {place.name}
                {place.security !== undefined && (
                  <SecurityStatus security={place.security} className="ml-1" />
                )}
              </span>
              <span className="shrink-0 text-xs text-text-dim">
                {t(`survey.info.kind.${tagKey[place.kind]}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
