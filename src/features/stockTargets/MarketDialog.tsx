/**
 * "New market" and "Change market": pick the station or structure the pilot
 * sells at, name the market, and (new only) start the list from what they
 * already sell there.
 *
 * The places the pilot has sell orders come first and need no typing. Any NPC
 * station matches off the local snapshot; a structure needs ESI's name search
 * (three letters, debounced, and only with the search scope), like the
 * Survey's location box.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { Button, Checkbox, FieldError, Modal, TextInput } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { StockTarget } from '@/engine/stockTargets/stockLists';
import { ESI_REGISTRY } from '@/esi/registry';
import { MIN_STRUCTURE_SEARCH_LENGTH, searchStructures } from '@/features/survey/surveyPlaces';
import { COMBOBOX_NAV_KEYS, moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { LOOKUP_DEBOUNCE_MS } from '@/lib/useDebouncedValue';
import { rankedSearch } from '@/lib/rankedSearch';
import { loadNpcStations } from '@/sde/loadMarketSde';
import type { NpcStationEntry } from '@/sde/marketTypes';
import { loadListedAtMarket, loadSellLocations, type SellLocation } from './stockTargetsData';

const SEARCH_SCOPE = ESI_REGISTRY.getCharacterSearch.scope;
const STATION_LIMIT = 20;

interface PlaceOption {
  id: number;
  name: string;
  kind: 'station' | 'structure';
  /** Set for a place the pilot sells at now. */
  orderCount?: number;
}

export interface MarketChoice {
  locationId: number;
  name: string;
  /** Starting Stock Targets: what the pilot sells there now, when they asked for it. */
  items: StockTarget[];
}

function MarketPlacePicker({
  inputId,
  inputRef,
  picked,
  characterId,
  invalid,
  describedBy,
  onPick,
}: {
  inputId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  picked: PlaceOption | null;
  characterId: number | null;
  invalid: boolean;
  describedBy: string | undefined;
  onPick: (place: PlaceOption) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const granted = useGrantedScopes();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [selling, setSelling] = useState<SellLocation[]>([]);
  const [stations, setStations] = useState<readonly NpcStationEntry[]>([]);
  const [structureHits, setStructureHits] = useState<{ key: string; places: PlaceOption[] } | null>(
    null
  );

  useEffect(() => {
    let live = true;
    void loadSellLocations()
      .catch(() => [])
      .then((list) => {
        if (live) setSelling(list);
      });
    void loadNpcStations()
      .catch(() => [])
      .then((list) => {
        if (live) setStations(list);
      });
    return () => {
      live = false;
    };
  }, []);

  const typed = query?.trim() ?? '';
  const canSearch = characterId !== null && granted !== undefined && granted.includes(SEARCH_SCOPE);
  const searchKey = canSearch && typed.length >= MIN_STRUCTURE_SEARCH_LENGTH ? typed : '';
  useEffect(() => {
    if (searchKey === '' || characterId === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchStructures(characterId, searchKey, controller.signal)
        .catch(() => [])
        .then((places) => {
          if (controller.signal.aborted) return;
          setStructureHits({
            key: searchKey,
            places: places.flatMap((place) =>
              place.id === null ? [] : [{ id: place.id, name: place.name, kind: 'structure' }]
            ),
          });
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchKey, characterId]);

  const { sellingNow, others } = useMemo(() => {
    const lower = typed.toLowerCase();
    const known: PlaceOption[] = selling
      .filter((place) => lower === '' || place.name.toLowerCase().includes(lower))
      .map((place) => ({
        id: place.locationId,
        name: place.name,
        kind: place.kind,
        orderCount: place.orderCount,
      }));
    const sellingNow = known.filter((place) => (place.orderCount ?? 0) > 0);
    // Structures the pilot keeps items at lead the other places, even before typing.
    const itemsHere = known.filter((place) => place.orderCount === 0);
    const taken = new Set(known.map((place) => place.id));
    const searched: PlaceOption[] =
      typed === ''
        ? []
        : [
            ...rankedSearch(stations, typed, { primary: (s) => s.name, limit: STATION_LIMIT }).map(
              (s): PlaceOption => ({ id: s.id, name: s.name, kind: 'station' })
            ),
            ...(structureHits?.key === searchKey ? structureHits.places : []),
          ].filter((place) => !taken.has(place.id));
    const others = [...itemsHere, ...searched];
    return { sellingNow, others };
  }, [selling, stations, typed, structureHits, searchKey]);
  const options = [...sellingNow, ...others];

  function choose(place: PlaceOption) {
    onPick(place);
    setQuery(null);
    setOpen(false);
    setHighlight(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (COMBOBOX_NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      setHighlight(moveHighlight(event.key as ComboboxNavKey, active, options.length));
    } else if (event.key === 'Enter' && active !== null) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Escape' && open) {
      // Closes the list, not the dialog.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setQuery(null);
    }
  }

  const showList = open && options.length > 0;
  // Enter picks what is highlighted, so something always is while the list shows.
  const active = showList ? Math.min(highlight ?? 0, options.length - 1) : null;
  useEffect(() => {
    if (active === null) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);
  const group = (key: string, text: string, places: PlaceOption[], offset: number) => (
    <li role="presentation">
      <ul role="group" aria-labelledby={`${listId}-${key}`}>
        <li
          role="presentation"
          id={`${listId}-${key}`}
          className={cx(eyebrowClassName, 'px-3 pt-2 pb-1')}
        >
          {text}
        </li>
        {places.map((place, index) => option(place, offset + index))}
      </ul>
    </li>
  );
  const option = (place: PlaceOption, index: number) => (
    <li
      key={place.id}
      id={`${listId}-${index}`}
      role="option"
      aria-selected={index === active}
      className={cx(
        tappableRowClassName,
        'flex cursor-pointer flex-col justify-center border-l-2 px-3 py-1 text-sm',
        index === active ? 'border-accent bg-panel-2' : 'border-transparent hover:bg-panel-2'
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => choose(place)}
    >
      <span className="[overflow-wrap:anywhere]">{place.name}</span>
      <span className="text-xs text-text-dim">
        {t(`stockTargets.place.${place.kind}`)}
        {place.orderCount !== undefined &&
          ` · ${
            place.orderCount > 0
              ? t('stockTargets.list.sellOrders', { count: place.orderCount })
              : t('stockTargets.list.itemsHere')
          }`}
      </span>
    </li>
  );

  return (
    <div className="relative">
      <TextInput
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active === null ? undefined : `${listId}-${active}`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        className="w-full"
        placeholder={t('stockTargets.list.locationPlaceholder')}
        value={query ?? picked?.name ?? ''}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlight(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setQuery(null);
        }}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={t('stockTargets.list.locationOptions')}
        hidden={!showList}
        // In flow, not a popover: the Modal body scrolls and would clip an absolute list.
        className="mt-1 max-h-60 overflow-auto rounded-xs border border-line-bright bg-panel py-1"
      >
        {sellingNow.length > 0 &&
          group('selling', t('stockTargets.list.sellingNow'), sellingNow, 0)}
        {others.length > 0 &&
          group('other', t('stockTargets.list.otherPlaces'), others, sellingNow.length)}
      </ul>
    </div>
  );
}

export function MarketDialog({
  mode,
  characterId,
  initial,
  returnFocusFallback,
  takenBy,
  onSubmit,
  onClose,
}: {
  mode: 'new' | 'change';
  characterId: number | null;
  /** The market being changed: its place and its own name. */
  initial?: { locationId: number; placeName: string; name: string };
  /** Where focus goes when the button that opened this is gone after Create. */
  returnFocusFallback?: () => HTMLElement | null;
  /** The name of another market already kept at a place: one market per place. */
  takenBy: (locationId: number) => string | undefined;
  onSubmit: (choice: MarketChoice) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PlaceOption | null>(
    initial ? { id: initial.locationId, name: initial.placeName, kind: 'station' } : null
  );
  // Null follows the picked place's name until the pilot types one of their own.
  const [name, setName] = useState<string | null>(initial ? initial.name : null);
  const [seed, setSeed] = useState(true);
  const [listed, setListed] = useState<{ locationId: number; items: StockTarget[] } | null>(null);
  const [error, setError] = useState<'location' | 'taken' | 'name' | null>(null);

  useEffect(() => {
    if (mode !== 'new' || picked === null) return;
    let live = true;
    void loadListedAtMarket(picked.id)
      .catch(() => [])
      .then((items) => {
        if (live) setListed({ locationId: picked.id, items });
      });
    return () => {
      live = false;
    };
  }, [mode, picked]);

  const seedItems = listed !== null && listed.locationId === picked?.id ? listed.items : [];
  const shownName = name ?? picked?.name ?? '';

  return (
    <Modal
      open
      onClose={onClose}
      title={t(mode === 'new' ? 'stockTargets.list.newTitle' : 'stockTargets.list.changeTitle')}
      initialFocusRef={pickerRef}
      returnFocusFallback={returnFocusFallback}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (picked === null) {
            setError('location');
            pickerRef.current?.focus();
            return;
          }
          if (takenBy(picked.id) !== undefined) {
            setError('taken');
            pickerRef.current?.focus();
            return;
          }
          if (shownName.trim() === '') {
            setError('name');
            nameRef.current?.focus();
            return;
          }
          onSubmit({
            locationId: picked.id,
            name: shownName.trim(),
            items: mode === 'new' && seed ? seedItems : [],
          });
          onClose();
        }}
      >
        <div className="space-y-1">
          <label className="block text-xs text-text-dim" htmlFor={`${id}-place`}>
            {t('stockTargets.list.locationLabel')}
          </label>
          <MarketPlacePicker
            inputId={`${id}-place`}
            inputRef={pickerRef}
            picked={picked}
            characterId={characterId}
            invalid={error === 'location' || error === 'taken'}
            describedBy={error === 'location' || error === 'taken' ? `${id}-error` : undefined}
            onPick={(place) => {
              // A rename the pilot typed survives a change of place; the default follows it.
              if (mode === 'change' && name === initial?.placeName) setName(null);
              setPicked(place);
              setError(null);
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-text-dim" htmlFor={`${id}-name`}>
            {t('stockTargets.list.nameLabel')}
          </label>
          <TextInput
            ref={nameRef}
            id={`${id}-name`}
            className="w-full"
            value={shownName}
            placeholder={t('stockTargets.list.namePlaceholder')}
            aria-invalid={error === 'name' || undefined}
            aria-describedby={error === 'name' ? `${id}-error` : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </div>
        {mode === 'new' && seedItems.length > 0 && (
          <label className={cx(tappableRowClassName, 'flex cursor-pointer items-start gap-2')}>
            <Checkbox
              className="mt-0.5"
              checked={seed}
              onChange={(e) => setSeed(e.target.checked)}
            />
            <span className="text-sm">
              {t('stockTargets.list.seed', { count: seedItems.length })}
              <span className="block text-xs text-text-dim">{t('stockTargets.list.seedHint')}</span>
            </span>
          </label>
        )}
        {error !== null && (
          <FieldError id={`${id}-error`} className="block text-xs">
            {error === 'taken'
              ? t('stockTargets.list.locationTaken', { name: picked ? takenBy(picked.id) : '' })
              : t(
                  error === 'location'
                    ? 'stockTargets.list.locationRequired'
                    : 'stockTargets.list.nameRequired'
                )}
          </FieldError>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary">
            {t(mode === 'new' ? 'stockTargets.list.create' : 'stockTargets.list.change')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
