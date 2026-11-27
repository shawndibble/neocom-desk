import { useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Button, LiveStatus, Spinner, TextInput } from '@/components/ui';
import { activeOptionClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { ESI_REGISTRY } from '@/esi/registry';
import { useSolarSystemList } from '@/features/route/useSolarSystems';
import { useCombobox } from '@/lib/useCombobox';
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
  characterId: number | null;
  onPick: (place: SurveyPlace | null) => void;
}) {
  const { t } = useTranslation();
  const granted = useGrantedScopes();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [stations, setStations] = useState<readonly NpcStationEntry[]>([]);
  const [knownStructures, setKnownStructures] = useState<(query: string) => SurveyPlace[]>(
    () => () => []
  );
  const [structureHits, setStructureHits] = useState<{ key: string; places: SurveyPlace[] } | null>(
    null
  );
  const [heldEnter, setHeldEnter] = useState<string | null>(null);
  const [pasted, setPasted] = useState<string | null>(null);
  const pasting = useRef(false);
  const { systems, failed: systemsFailed, retry: retrySystems } = useSolarSystemList(open);
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
  const canSearch = characterId !== null && granted !== undefined && granted.includes(SEARCH_SCOPE);
  const searchText = canSearch && typed.length >= MIN_STRUCTURE_SEARCH_LENGTH ? typed : '';
  const searchKey = searchText === '' ? '' : `${characterId}:${searchText}`;
  useEffect(() => {
    if (searchKey === '' || characterId === null) return;
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

  const lead = places[0];
  const exact =
    lead !== undefined && lead.kind !== 'manual' && isExactPlace(lead, typed) ? lead : undefined;
  const showList = open && (places.length > 0 || searching);
  const combo = useCombobox({
    count: places.length,
    open: showList,
    fallback: exact === undefined ? null : 0,
  });
  const active = combo.activeIndex;

  function enterPick(): SurveyPlace | undefined {
    if (active !== null) return places[active];
    return places.length === 1 ? places.find((place) => place.kind === 'manual') : undefined;
  }

  function choose(place: SurveyPlace) {
    onPick(place);
    setQuery(null);
    setOpen(false);
    combo.reset();
    setHeldEnter(null);
    setPasted(null);
  }

  const pastedPick = pasted !== null && pasted === query ? exact : undefined;
  const heldAnswered = heldEnter !== null && heldEnter === query && !searching;
  const autoPick = useEffectEvent(() => {
    const place = pastedPick ?? (heldAnswered ? enterPick() : undefined);
    if (place !== undefined) choose(place);
    else if (heldAnswered) setHeldEnter(null);
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- answers an async arrival (the cache read or ESI's search), not a render-time derivation
    if (pastedPick !== undefined || heldAnswered) autoPick();
  }, [pastedPick, heldAnswered]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (combo.handleNavKey(event)) {
      setOpen(true);
      setHeldEnter(null);
    } else if (event.key === 'Enter') {
      const place = enterPick();
      if (active === null && searching && query !== null) {
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

  return (
    <div
      ref={wrapRef}
      tabIndex={-1}
      className="relative min-w-0 flex-1 basis-64 focus:outline-none"
    >
      <LiveStatus>{open && systemsFailed ? t('jumpRange.systemsFailed') : ''}</LiveStatus>
      <TextInput
        size="sm"
        className="w-full"
        {...combo.inputProps}
        aria-label={t('survey.info.location')}
        autoComplete="off"
        placeholder={t('survey.info.locationPlaceholder')}
        value={query ?? value?.name ?? ''}
        onPaste={() => {
          pasting.current = true;
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          combo.reset();
          setHeldEnter(null);
          setPasted(pasting.current ? event.target.value : null);
          pasting.current = false;
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          if (query !== null && query.trim() === '' && value !== null) onPick(null);
          setQuery(null);
        }}
        onKeyDown={onKeyDown}
      />
      {open && systemsFailed && (
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
          <ul {...combo.listboxProps} className="flex flex-col">
            {places.map((place, index) => (
              <li
                key={`${place.kind}-${place.id ?? place.name}`}
                {...combo.optionProps(index)}
                className={cx(
                  'flex cursor-pointer items-baseline justify-between gap-3 px-2 py-1 touch:min-h-9 touch:items-center',
                  rowInteractiveClassName,
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
