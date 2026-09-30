import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Modal, SearchInput, Spinner } from '@/components/ui';
import { cx } from '@/lib/cx';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { listNavDestinations, NAV_LOCK_PATHS } from '@/app/navDestinations';
import { useLockedRoutes } from '@/app/useGrantedScopes';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useCorpNavVisible } from '@/features/corp/useCorpNavVisible';
import { openPublicInfoModal } from '@/stores/publicInfoModal';
import { CONTACT_TYPE_KEY } from '@/features/character/contactsFilter';
import {
  createContactsProvider,
  loadPaletteContacts,
  type PaletteContact,
} from './contactsProvider';
import { createAssetsProvider, loadPaletteAssets, type PaletteAsset } from './assetsProvider';
import {
  createMarketItemsProvider,
  marketItemCatalogue,
  type ShownMarketItem,
} from './marketItems';
import { loadLpCorporations } from '@/sde/loadMarketSde';
import { readCachedLoyaltyBalances } from '@/features/character/loyalty';
import { createCharactersProvider, createCommandsProvider, createPagesProvider } from './providers';
import { createLpStoresProvider, NO_BALANCES } from './lpStoresProvider';
import type { PaletteProvider, PaletteResult } from './types';
import { usePaletteSearch } from './usePaletteSearch';

const NO_CHARACTERS: readonly { characterId: number; name: string }[] = [];
const NO_CONTACTS: readonly PaletteContact[] = [];
const NO_ASSETS: readonly PaletteAsset[] = [];

function signedStanding(standing: number): string {
  return standing > 0 ? `+${standing}` : String(standing);
}

/** The live reads behind the shipped groups, turned into providers. */
function useShippedProviders(onShowItem: (item: ShownMarketItem) => void): PaletteProvider[] {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const locked = useLockedRoutes(NAV_LOCK_PATHS);
  const corpVisible = useCorpNavVisible();
  const { capabilities } = useCorpAccess();
  const characters = useLiveQuery(() => db.characters.toArray(), [], NO_CHARACTERS);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);
  // Cache-only and live (Dexie re-reads it on a cache or grant change), never
  // per keystroke: typing neither waits on it nor fetches.
  const contacts = useLiveQuery(loadPaletteContacts, [], NO_CONTACTS);
  const assets = useLiveQuery(loadPaletteAssets, [], NO_ASSETS);

  const destinations = useMemo(
    () => listNavDestinations({ locked, corpVisible, corpCapabilities: capabilities, t }),
    [locked, corpVisible, capabilities, t]
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
        balanceHint: (lp) => t('commandPalette.lpBalance', { lp: lp.toLocaleString() }),
      }),
    [activeCharacterId, navigate, t]
  );

  return useMemo(
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
        assets,
        activeCharacterId,
        navigate: (path) => void navigate(path),
        describe: (asset) =>
          asset.holders
            .map((holder) =>
              t('commandPalette.assetHolder', {
                quantity: holder.quantity.toLocaleString(),
                character: holder.characterName,
              })
            )
            .join(' · '),
        quantityHint: (quantity) =>
          t('commandPalette.assetQuantity', { quantity: quantity.toLocaleString() }),
      }),
      lpStores,
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
      lpStores,
      onShowItem,
    ]
  );
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
  const providers = useShippedProviders(onShowItem);
  const [query, setQuery] = useState('');
  const groups = usePaletteSearch(providers, query);

  // Keyed by group and result id, not position, so an async group landing
  // above the highlight does not move it onto a different row.
  const options = groups.flatMap((group) =>
    group.results.map((result) => ({ key: `${group.provider.id}:${result.id}`, result }))
  );
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  // A new query starts back at the top: Enter then takes the best match.
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setHighlightedKey(null);
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

  function activate(result: PaletteResult) {
    // Closed first: the dialog's teardown hands focus back to where it came
    // from, and a navigation's own route focus then lands after it.
    onClose();
    result.run();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        if (options.length === 0) return;
        event.preventDefault();
        const next = moveHighlight(event.key as ComboboxNavKey, highlightedIndex, options.length);
        setHighlightedKey(next === null ? null : options[next].key);
        break;
      }
      case 'Enter':
        if (highlightedIndex === null) return;
        event.preventDefault();
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
  // The error row is not an option, so the live count alone would hide it.
  const groupFailed = groups.some((group) => group.status === 'error');

  return (
    <Modal open onClose={onClose} title={t('commandPalette.title')}>
      <div className="flex flex-col gap-2">
        <SearchInput
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
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
            className="flex flex-col gap-2"
          >
            {groups.map((group) => {
              const headingId = `${baseId}-group-${group.provider.id}`;
              return (
                <div key={group.provider.id} role="group" aria-labelledby={headingId}>
                  <div
                    id={headingId}
                    role="presentation"
                    className="px-2 pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-faint uppercase"
                  >
                    {t(group.provider.labelKey)}
                  </div>
                  {group.status === 'error' ? (
                    <div className="px-2 py-1.5 text-sm text-danger">
                      {t('commandPalette.groupError')}
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
                    group.results.map((result) => {
                      const index = optionIndex++;
                      const highlighted = index === highlightedIndex;
                      return (
                        <div
                          key={result.id}
                          id={optionDomId(index)}
                          role="option"
                          aria-selected={highlighted}
                          title={result.locked ? t('reauth.navLocked') : undefined}
                          // Keeps focus in the input, as every combobox here does.
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => activate(result)}
                          className={cx(
                            'flex min-h-11 cursor-pointer md:min-h-9 items-center gap-2 rounded-xs px-2 py-1.5 text-sm',
                            highlighted ? 'bg-panel-2 text-text' : 'text-text-dim hover:bg-panel-2'
                          )}
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{result.label}</span>
                            {result.sublabel && (
                              <span className="truncate text-xs text-text-faint">
                                {result.sublabel}
                              </span>
                            )}
                          </span>
                          {result.hint && (
                            <span className="shrink-0 text-xs text-text-faint">{result.hint}</span>
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
                    })
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
        <span role="status" aria-live="polite" className="sr-only">
          {trimmed === ''
            ? ''
            : `${t('commandPalette.resultsCount', { count: options.length })}${groupFailed ? `. ${t('commandPalette.groupError')}` : ''}`}
        </span>
      </div>
    </Modal>
  );
}
