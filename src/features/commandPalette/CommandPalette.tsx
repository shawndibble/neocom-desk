import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCharacters } from '@/features/character/useCharacters';
import { EmptyState, Modal, SearchInput, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  activeOptionClassName,
  focusRingClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { cx } from '@/lib/cx';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { routePaste } from '@/app/pasteRouting';
import { listNavDestinations, NAV_LOCK_PATHS, type NavDestination } from '@/app/navDestinations';
import { recentNavFor, viewPathFor } from '@/app/navRail';
import { useRecentNav } from '@/app/navPreferences';
import { useLockedRoutes } from '@/app/useGrantedScopes';
import { useCorpViewCapabilities } from '@/features/corp/useCorpViewCapabilities';
import { useHiddenTabPaths } from '@/app/useHiddenTabPaths';
import { useCorpNavVisible } from '@/features/corp/useCorpNavVisible';
import { useSrpNavVisible } from '@/features/corp/srp/useSrpNavVisible';
import { openPublicInfoModal } from '@/stores/publicInfoModal';
import { CONTACT_TYPE_KEY } from '@/features/character/contactsFilter';
import {
  createContactsProvider,
  loadPaletteContacts,
  type PaletteContact,
} from './contactsProvider';
import {
  createAssetsProvider,
  loadPaletteAssets,
  loadPaletteAssetsScope,
  type PaletteAsset,
} from './assetsProvider';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import {
  createMarketItemsProvider,
  marketItemCatalogue,
  type ShownMarketItem,
} from './marketItems';
import { loadLpCorporations, loadSolarSystems } from '@/sde/loadMarketSde';
import { loadShipTree } from '@/sde/loadSde';
import { ENTITY_INFO_PUSHED_STATE } from '@/features/entities/entityInfoState';
import { createShipsProvider } from './shipsProvider';
import { createPlacesProvider } from './placesProvider';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useOnline } from '@/stores/network';
import { setWaypointsInGame } from '@/features/travel/sendWaypoints';
import {
  WAYPOINT_ENDPOINTS,
  WAYPOINT_GROUPS,
  waypointOutcome,
} from '@/features/travel/waypointOutcome';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { searchKnownPlaces } from '@/features/places/placeSearch';
import { resolvePlace } from '@/features/places';
import { usePlaceNicknames } from '@/features/assets/placeNicknames';
import { fixed1 } from '@/lib/fixedFormat';
import { readCachedLoyaltyBalances } from '@/features/character/loyalty';
import { createCharactersProvider, createCommandsProvider, createPagesProvider } from './providers';
import { createLpStoresProvider, NO_BALANCES } from './lpStoresProvider';
import { type PaletteAltOutcome, type PaletteProvider, type PaletteResult } from './types';
import { groupCountLabel, rankGroups, visibleRowCounts } from './rowBudget';
import { usePaletteSearch } from './usePaletteSearch';

const NO_CONTACTS: readonly PaletteContact[] = [];
const NO_ASSETS: readonly PaletteAsset[] = [];

function signedStanding(standing: number): string {
  return standing > 0 ? `+${standing}` : String(standing);
}

/** The live reads behind the shipped groups, turned into providers. */
function useShippedProviders(onShowItem: (item: ShownMarketItem) => void): {
  providers: PaletteProvider[];
  destinations: NavDestination[];
} {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const shipWindowOpen =
    location.pathname === '/ships/tree' && new URLSearchParams(location.search).has('ship');
  const locked = useLockedRoutes(NAV_LOCK_PATHS);
  const corpVisible = useCorpNavVisible();
  const srpVisible = useSrpNavVisible();
  const hiddenTabPaths = useHiddenTabPaths();
  const capabilities = useCorpViewCapabilities();
  const characters = useCharacters();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);
  // Cache-only and live (Dexie re-reads it on a cache or grant change), never
  // per keystroke: typing neither waits on it nor fetches.
  const contacts = useLiveQuery(loadPaletteContacts, [], NO_CONTACTS);
  const assets = useLiveQuery(loadPaletteAssets, [], NO_ASSETS);
  const assetsScope = useLiveQuery(loadPaletteAssetsScope, []);

  const destinations = useMemo(
    () =>
      listNavDestinations({
        locked,
        corpVisible,
        corpCapabilities: capabilities,
        srpVisible,
        t,
        hiddenTabPaths,
      }),
    [locked, corpVisible, capabilities, srpVisible, t, hiddenTabPaths]
  );

  // Its own memo, keyed only on what it reads: the provider holds the loaded
  // corporation list, so a Character-list or nav-lock change must not throw
  // it away and flash the group back to loading.
  const lpStores = useMemo(
    () =>
      createLpStoresProvider({
        loadCorporations: loadLpCorporations,
        loadBalances: () =>
          activeCharacterId === null
            ? Promise.resolve(NO_BALANCES)
            : readCachedLoyaltyBalances(activeCharacterId),
        navigate: (path) => void navigate(path),
        balanceHint: (lp) => t('commandPalette.lpBalance', { lp: formatCount(lp) }),
      }),
    [activeCharacterId, navigate, t]
  );

  // Same reason as LP Stores: it holds the loaded Ship Tree. The pushed-entry
  // marker makes Back from the window return to the page the pilot was on.
  const ships = useMemo(
    () =>
      createShipsProvider({
        loadShipTree,
        // Over an open Ship Info window, replace: one Close or Back still leaves the tree.
        onOpen: (typeID) =>
          void navigate(
            `/ships/tree?ship=${typeID}`,
            shipWindowOpen ? { replace: true } : { state: ENTITY_INFO_PUSHED_STATE }
          ),
      }),
    [navigate, shipWindowOpen]
  );

  const online = useOnline();
  const lacksWaypointScope = useCharacterLacksEndpoints(activeCharacterId, WAYPOINT_ENDPOINTS);
  const setWaypoint = useMemo(
    () =>
      async (locationId: number, placeName: string): Promise<PaletteAltOutcome> => {
        if (activeCharacterId === null)
          return { tone: 'alert', text: t('travel.waypoints.needCharacter') };
        if (lacksWaypointScope)
          return { tone: 'alert', text: <GrantMissingLink groups={WAYPOINT_GROUPS} /> };
        if (!online) return { tone: 'alert', text: t('common.needsConnection') };
        return waypointOutcome(
          await setWaypointsInGame(activeCharacterId, [locationId]),
          placeName,
          t
        );
      },
    [activeCharacterId, lacksWaypointScope, online, t]
  );
  const places = useMemo(
    () =>
      createPlacesProvider({
        loadSystems: loadSolarSystems,
        searchPlaces: (query, limit) => searchKnownPlaces(activeCharacterId, query, limit),
        nicknames: () => usePlaceNicknames.getState().value,
        resolvePlace: async (locationId) => {
          const place = await resolvePlace(
            { locationId, characterId: activeCharacterId },
            undefined,
            { settle: true }
          );
          return place.name !== null && place.systemId !== null
            ? { name: place.name, systemId: place.systemId }
            : null;
        },
        openRoute: (systemId, stationId) =>
          void navigate(routeToHref(systemId, null, null, stationId)),
        setWaypoint,
        waypointLabel: t('commandPalette.setWaypoint'),
        describeSystem: (system) =>
          t('commandPalette.systemSublabel', { security: fixed1(system.security) }),
        describeStation: ({ name, systemName }, nickname) =>
          [nickname === undefined ? null : name, systemName]
            .filter((part): part is string => part !== null)
            .join(' · '),
      }),
    [activeCharacterId, navigate, setWaypoint, t]
  );

  const providers = useMemo(
    () => [
      createPagesProvider({ destinations, navigate: (path) => void navigate(path) }),
      createCommandsProvider({
        t,
        navigate: (path) => void navigate(path),
        addCharacter: () => void beginAddCharacterLogin(),
      }),
      createCharactersProvider({
        characters,
        activeCharacterId,
        activeHint: t('commandPalette.activeCharacter'),
        onSelect: (characterId) => void setActiveCharacter(characterId),
      }),
      createContactsProvider({
        contacts,
        onOpen: openPublicInfoModal,
        describe: (contact) =>
          [
            t(CONTACT_TYPE_KEY[contact.kind]),
            ...contact.holders.map((holder) =>
              t('commandPalette.contactStanding', {
                standing: signedStanding(holder.standing),
                character: holder.characterName,
              })
            ),
          ].join(' · '),
      }),
      createAssetsProvider({
        scope: assetsScope,
        assets,
        activeCharacterId,
        navigate: (path) => void navigate(path),
        describe: (asset) =>
          asset.holders
            .map((holder) =>
              t('commandPalette.assetHolder', {
                quantity: formatCount(holder.quantity),
                character: holder.characterName,
              })
            )
            .join(' · '),
        quantityHint: (quantity) =>
          t('commandPalette.assetQuantity', { quantity: formatCount(quantity) }),
      }),
      places,
      lpStores,
      ships,
      createMarketItemsProvider({ catalogue: marketItemCatalogue, onSelect: onShowItem }),
    ],
    [
      destinations,
      navigate,
      t,
      characters,
      activeCharacterId,
      setActiveCharacter,
      contacts,
      assets,
      assetsScope,
      places,
      lpStores,
      ships,
      onShowItem,
    ]
  );
  return { providers, destinations };
}

interface CommandPaletteProps {
  onClose: () => void;
  /** A Market Items pick: Item Detail over the current page, owned by the host so it outlives the palette. */
  onShowItem: (item: ShownMarketItem) => void;
}

/**
 * The Command Palette (#2318): one search box over grouped results — Pages,
 * Commands, Characters, Assets, Market Items (#2319), LP Stores, Contacts —
 * each group a provider (`types.ts`).
 *
 * A hand-built ARIA combobox (decision 20260905-114550), after
 * `BuildLocationPicker`: DOM focus stays in the input, and the highlighted
 * option is named by `aria-activedescendant`. The listbox holds one
 * `role="group"` per provider, labelled by its heading, so a screen reader
 * says which group an option is in. The highlight is one index across every
 * group, so the arrows run straight over a group boundary.
 *
 * Rendered only while open (`CommandPaletteHost`), so each opening starts
 * with an empty query and the first result highlighted.
 */
export function CommandPalette({ onClose, onShowItem }: CommandPaletteProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const { providers, destinations } = useShippedProviders(onShowItem);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  // Only the latest paste may navigate, whichever classifies first.
  const latestPaste = useRef(0);
  // The rail's layouts only: below `md` the More sheet already showed Recent
  // before the palette opened.
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  const recent = useRecentNav((state) => state.value);
  const [query, setQuery] = useState('');
  const found = usePaletteSearch(providers, query);
  const groups = useMemo(() => rankGroups(found, query), [found, query]);
  // Sections the pilot has arrowed into show every row; the rest show a few.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const rowCounts = visibleRowCounts(groups, expanded);

  // Keyed by group and result id, not position, so an async group landing
  // above the highlight does not move it onto a different row.
  const allOptions = groups.flatMap((group) =>
    group.results.map((result) => ({
      groupId: group.provider.id,
      key: `${group.provider.id}:${result.id}`,
      result,
    }))
  );
  // What is on screen. Hidden rows take no index: arrowing onto one expands its section first.
  const options = groups.flatMap((group) =>
    group.results
      .slice(0, rowCounts.get(group.provider.id) ?? 0)
      .map((result) => ({ key: `${group.provider.id}:${result.id}`, result }))
  );
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const [altOutcome, setAltOutcome] = useState<PaletteAltOutcome>(null);
  /** A second Shift+Enter while one is sending must not send twice. */
  const altInFlight = useRef(false);
  // A new query starts back at the top: Enter then takes the best match.
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setHighlightedKey(null);
    setExpanded(new Set());
    setAltOutcome(null);
  }
  const foundIndex = options.findIndex((option) => option.key === highlightedKey);
  const highlightedIndex = foundIndex >= 0 ? foundIndex : options.length > 0 ? 0 : null;
  const optionDomId = (index: number) => `${baseId}-option-${index}`;
  const activeDescendant = highlightedIndex === null ? undefined : optionDomId(highlightedIndex);

  // `Modal` focuses its own body on open; this effect runs after the dialog's
  // (a child's effects run first), so the input takes focus from there.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // A closed palette (Escape, a pick) must not be navigated by a paste still classifying.
  useEffect(
    () => () => {
      latestPaste.current = -1;
    },
    []
  );

  // The item catalogue starts loading as the palette opens, not at the third
  // keystroke — and off the render path, so typing never waits on it. Each
  // opening retries a failed load once; a failure is the Market Items
  // group's to report.
  useEffect(() => {
    marketItemCatalogue.load({ retry: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeDescendant === undefined) return;
    document.getElementById(activeDescendant)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeDescendant]);

  /** Shift+Enter or the row's button: the second action, palette kept open to show its outcome. */
  function activateAlt(result: PaletteResult) {
    const action = result.altAction;
    if (!action) return;
    if (altInFlight.current) return;
    altInFlight.current = true;
    setAltOutcome(null);
    void Promise.resolve(action.run())
      .then(setAltOutcome, () =>
        setAltOutcome({ tone: 'alert', text: t('travel.waypoints.unknownError') })
      )
      .finally(() => {
        altInFlight.current = false;
      });
  }

  function activate(result: PaletteResult) {
    // Closed first: the dialog's teardown hands focus back to where it came
    // from, and a navigation's own route focus then lands after it.
    onClose();
    result.run();
  }

  /**
   * A multi-line paste the app recognises (a fit, a skill plan, an item list…)
   * goes where `GlobalPasteRouter` would send it, no confirm step. The text
   * still lands in the input meanwhile, so one that matches nothing — or an
   * item list read offline, which says nothing here — just stays as typed.
   * A single line is a search.
   */
  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text/plain');
    const id = ++latestPaste.current;
    if (!text.trim().includes('\n')) return;
    void routePaste(text, { pathname, search }).then(({ route }) => {
      if (id !== latestPaste.current || route === null) return;
      // Closed first, as `activate` does, so focus hands back before the route's own.
      onClose();
      void navigate(...route);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'Tab':
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        if (allOptions.length === 0) return;
        event.preventDefault();
        // Options are not focusable, so Tab would only leave the input and
        // strand Enter: it steps the highlight like the arrows instead.
        const key: ComboboxNavKey =
          event.key === 'Tab'
            ? event.shiftKey
              ? 'ArrowUp'
              : 'ArrowDown'
            : (event.key as ComboboxNavKey);
        // Steps over every row, hidden ones too: landing on one opens its section.
        const current =
          highlightedIndex === null
            ? null
            : allOptions.findIndex((option) => option.key === options[highlightedIndex].key);
        const next = moveHighlight(key, current, allOptions.length);
        if (next === null) {
          setHighlightedKey(null);
          break;
        }
        const target = allOptions[next];
        setHighlightedKey(target.key);
        if (!expanded.has(target.groupId)) {
          setExpanded((previous) => new Set(previous).add(target.groupId));
        }
        break;
      }
      case 'Enter':
        if (highlightedIndex === null) return;
        event.preventDefault();
        if (event.shiftKey && options[highlightedIndex].result.altAction) {
          activateAlt(options[highlightedIndex].result);
          break;
        }
        activate(options[highlightedIndex].result);
        break;
      case 'Escape':
        // Handled here rather than left to the dialog's `cancel`: in a search
        // field with text the browser spends Escape on clearing it first.
        event.preventDefault();
        onClose();
        break;
    }
  }

  let optionIndex = 0;
  const trimmed = query.trim();
  const recentViews =
    trimmed === '' && isDesktop
      ? recentNavFor(recent, viewPathFor(pathname)).flatMap((path) => {
          const destination = destinations.find((candidate) => candidate.path === path);
          return destination ? [destination] : [];
        })
      : [];
  // The error row is not an option, so the live count alone would hide it.
  const failedGroups = groups.filter((group) => group.status === 'error');
  // Group error rows are `aria-hidden` (a listbox child that is not an
  // option); the status region carries them instead.
  const statusParts = [
    t('commandPalette.resultsCount', { count: allOptions.length }),
    ...new Set(
      failedGroups.map((group) => t(group.provider.errorKey ?? 'commandPalette.groupError'))
    ),
  ].filter((part): part is string => typeof part === 'string');
  const statusText =
    trimmed === ''
      ? ''
      : `${statusParts.map((part) => part.replace(/\.$/, '')).join('. ')}${statusParts.length > 1 ? '.' : ''}`;

  return (
    <Modal open onClose={onClose} title={t('commandPalette.title')}>
      <div className="flex flex-col gap-2">
        <SearchInput
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t('commandPalette.placeholder')}
          aria-label={t('commandPalette.inputLabel')}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={groups.length > 0}
          aria-controls={groups.length > 0 ? listboxId : undefined}
          aria-activedescendant={activeDescendant}
          autoComplete="off"
          spellCheck={false}
        />
        {groups.length > 0 ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label={t('commandPalette.resultsLabel')}
            // The input stays put above; only the results scroll.
            className="flex max-h-[min(30rem,60vh)] scroll-py-2 flex-col gap-2 overflow-y-auto overscroll-contain"
          >
            {groups.map((group) => {
              const headingId = `${baseId}-group-${group.provider.id}`;
              return (
                <div key={group.provider.id} role="group" aria-labelledby={headingId}>
                  <div
                    role="presentation"
                    className={cx(eyebrowClassName, 'flex items-center gap-2 px-2 pb-1')}
                  >
                    {/* The group's name is the label alone: the count is heard in the status region. */}
                    <span id={headingId} className="flex items-center gap-2">
                      {t(group.provider.labelKey)}
                      {group.provider.scope && <CharacterScopeReadout {...group.provider.scope} />}
                    </span>
                    {group.status === 'ready' && group.results.length > 0 && (
                      <span aria-hidden="true" className="ml-auto tabular-nums">
                        {groupCountLabel(group.results.length)}
                      </span>
                    )}
                  </div>
                  {group.status === 'error' ? (
                    <div aria-hidden="true" className="px-2 py-1.5 text-sm text-danger">
                      {t(group.provider.errorKey ?? 'commandPalette.groupError')}
                    </div>
                  ) : group.status === 'loading' ? (
                    <div
                      aria-hidden="true"
                      className="flex items-center gap-2 px-2 py-1.5 text-text-dim"
                    >
                      <Spinner size="sm" />
                      {t('commandPalette.loadingGroup')}
                    </div>
                  ) : (
                    <>
                      {group.results
                        .slice(0, rowCounts.get(group.provider.id) ?? 0)
                        .map((result) => {
                          const index = optionIndex++;
                          const highlighted = index === highlightedIndex;
                          return (
                            <div
                              key={result.id}
                              id={optionDomId(index)}
                              role="option"
                              aria-selected={highlighted}
                              aria-keyshortcuts={result.altAction ? 'Shift+Enter' : undefined}
                              // Keeps focus in the input, as every combobox here does.
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => activate(result)}
                              className={cx(
                                'flex min-h-9 cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-sm',
                                highlighted
                                  ? `bg-panel-2 text-text ${activeOptionClassName}`
                                  : 'text-text-dim hover:bg-panel-2'
                              )}
                            >
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate">{result.label}</span>
                                {result.sublabel && (
                                  <span className="truncate text-xs text-text-dim">
                                    {result.sublabel}
                                  </span>
                                )}
                              </span>
                              {highlighted && result.altAction && (
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    activateAlt(result);
                                  }}
                                  className={cx(
                                    'min-h-9 shrink-0 rounded-xs border border-line px-2 text-xs text-text',
                                    interactiveClassName,
                                    focusRingClassName
                                  )}
                                >
                                  {result.altAction.label}
                                  <kbd className="ml-1.5 hidden text-text-dim md:inline">⇧↵</kbd>
                                </button>
                              )}
                              {result.hint && (
                                <span className="shrink-0 text-xs text-text-dim">
                                  {result.hint}
                                </span>
                              )}
                              {result.locked && (
                                <>
                                  <span
                                    aria-hidden="true"
                                    className="size-1.5 shrink-0 rounded-full bg-warning"
                                  />
                                  <span className="sr-only">{`, ${t('reauth.navLocked')}`}</span>
                                </>
                              )}
                            </div>
                          );
                        })}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          trimmed !== '' && (
            <p className="px-2 py-1.5 text-sm text-text-dim">{t('commandPalette.noResults')}</p>
          )
        )}
        {trimmed === '' && (
          <EmptyState title={t('commandPalette.emptyTitle')} hint={t('commandPalette.emptyHint')} />
        )}
        {recentViews.length > 0 && (
          <section
            aria-label={t('nav.recent')}
            className="flex flex-wrap gap-1.5 border-t border-line px-2 pt-2"
          >
            {recentViews.map((view) => (
              <Link
                key={view.path}
                to={view.path}
                onClick={onClose}
                className={cx(
                  'flex min-h-9 items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-2 text-xs text-text hover:border-line-bright',
                  interactiveClassName,
                  focusRingClassName
                )}
              >
                <Icon.Recent aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                {view.breadcrumb}
              </Link>
            ))}
          </section>
        )}
        {altOutcome && (
          <p
            role={altOutcome.tone === 'alert' ? 'alert' : 'status'}
            className={cx(
              'px-2 text-sm',
              altOutcome.tone === 'alert' ? 'text-danger' : 'text-text-dim'
            )}
          >
            {altOutcome.text}
          </p>
        )}
        <span role="status" aria-live="polite" className="sr-only">
          {statusText}
        </span>
      </div>
    </Modal>
  );
}
