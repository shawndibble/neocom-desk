import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  FilterField,
  PageHeader,
  Panel,
  Spinner,
  TextArea,
  TabPanel,
  Tooltip,
} from '@/components/ui';
import { activeOptionClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import {
  MIN_RECIPIENT_SEARCH_LENGTH,
  searchMailRecipients,
} from '@/features/character/mailRecipientSearch';
import { isMultiLine, lineAt, namesOf, replaceLine } from '@/engine/pilotList/nameLines';
import { classifyPilotPaste, type PilotPaste } from '@/engine/pilotList/parsePilotPaste';
import { useCombobox } from '@/lib/useCombobox';
import { cx } from '@/lib/cx';
import { LOOKUP_DEBOUNCE_MS } from '@/lib/useDebouncedValue';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useTouchContext } from '@/lib/useMediaQuery';
import type { PilotListState } from '@/lib/shortcuts';
import { optionalIdParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { openPublicInfoModal } from '@/stores/publicInfoModal';
import {
  loadPilotProfile,
  resolvePilotByName,
  searchBoxSeed,
  type PilotProfile,
  type PilotSummary,
} from './pilotLookup';
import { DscanShareControl, PilotListView } from './PilotListView';
import { PilotProfileView } from './PilotProfileView';
import { useSharedDscanSeed } from './sharedDscanSeed';
import type { TravelTabProps } from './travelTab';

const PILOT_PARAMS = { pilot: optionalIdParam() };
const SEARCH_ENDPOINTS = ['getCharacterSearch'] as const;
export function PilotLookupPanel({ tabBar, tabsId }: TravelTabProps) {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(PILOT_PARAMS);
  const [resolved, setResolved] = useState<PilotSummary | null>(null);
  const [openAfterClear, setOpenAfterClear] = useState<number | null>(null);
  useEffect(() => {
    if (openAfterClear === null || params.pilot !== null) return;
    const id = setTimeout(() => {
      setOpenAfterClear(null);
      openPublicInfoModal('character', openAfterClear);
    }, 0);
    return () => clearTimeout(id);
  }, [openAfterClear, params.pilot]);
  const location = useLocation();
  const [list, setList] = useState<PilotPaste | null>(null);
  const [handledListKey, setHandledListKey] = useState<string | null>(null);
  useSharedDscanSeed((text) => {
    const pasted = classifyPilotPaste(text);
    if (pasted !== null) setList(pasted);
  });

  const routedText = (location.state as Partial<PilotListState> | null)?.pilotListText;
  if (routedText && handledListKey !== location.key) {
    setHandledListKey(location.key);
    const pasted = classifyPilotPaste(routedText);
    if (pasted !== null) setList(pasted);
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('travel.title')} />
      {tabBar}
      <TabPanel tabsId={tabsId} tabId="pilot" className="space-y-4">
        <Panel className="relative z-20">
          <PilotSearch
            resolved={resolved !== null && resolved.characterId === params.pilot ? resolved : null}
            list={list}
            onList={(paste) => {
              setList(paste);
              if (paste !== null && params.pilot !== null)
                setParams({ pilot: null }, { push: true });
            }}
            onSelect={(pilot) => {
              setList(null);
              if (params.pilot === null) openPublicInfoModal('character', pilot.characterId);
              else {
                setParams({ pilot: null });
                setOpenAfterClear(pilot.characterId);
              }
            }}
          />
        </Panel>
        {list !== null ? (
          <PilotListView paste={list} />
        ) : params.pilot === null ? (
          <EmptyState title={t('travel.pilot.pickTitle')} hint={t('travel.pilot.pickHint')} />
        ) : (
          <PilotResult key={params.pilot} characterId={params.pilot} onResolved={setResolved} />
        )}
      </TabPanel>
    </div>
  );
}

type ResolveState =
  | { kind: 'idle' }
  | { kind: 'resolving' }
  | { kind: 'not-found'; name: string }
  | { kind: 'bad-lines' }
  | { kind: 'failed' };

function hasCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

function PilotSearch({
  resolved,
  list,
  onList,
  onSelect,
}: {
  resolved: PilotSummary | null;
  list: PilotPaste | null;
  onList: (paste: PilotPaste | null) => void;
  onSelect: (pilot: PilotSummary) => void;
}) {
  const { t } = useTranslation();
  const touchCtx = useTouchContext();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const canSuggest = useEndpointsGranted(SEARCH_ENDPOINTS) === true && activeCharacterId !== null;
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PilotSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [resolve, setResolve] = useState<ResolveState>({ kind: 'idle' });
  const latestSearch = useRef(0);
  const latestLookup = useRef(0);
  const seededId = useRef<number | null>(null);
  const typing = useRef(false);
  const [caret, setCaret] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (resolved === null) seededId.current = null;
    const seed = searchBoxSeed({
      resolved,
      seededId: seededId.current,
      typing: typing.current,
    });
    if (seed === null) return;
    seededId.current = resolved?.characterId ?? null;
    setQuery(seed);
    setSuggestions([]);
    setOpen(false);
  }, [resolved]);

  const multi = isMultiLine(query);
  const exact = query.trim();
  const trimmed = lineAt(query, caret).text.trim();
  const shown = canSuggest && trimmed.length >= MIN_RECIPIENT_SEARCH_LENGTH ? suggestions : [];
  const listOpen = open && shown.length > 0;
  const combo = useCombobox({ count: shown.length, open: listOpen });

  useEffect(() => {
    if (!canSuggest || activeCharacterId === null) return;
    if (trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH) return;
    if (!typing.current) return;
    const ticket = ++latestSearch.current;
    const controller = new AbortController();
    const id = setTimeout(() => {
      void searchMailRecipients(activeCharacterId, trimmed, controller.signal)
        .then((hits) => {
          if (ticket !== latestSearch.current) return;
          setSuggestions(hits);
        })
        .catch(() => {
          if (ticket !== latestSearch.current || controller.signal.aborted) return;
          setSuggestions([]);
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [canSuggest, activeCharacterId, trimmed]);

  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    areaRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    setCaret(pendingCaret.current);
    pendingCaret.current = null;
  }, [query]);

  function choose(pilot: PilotSummary) {
    if (multi) {
      const next = replaceLine(query, caret, pilot.name);
      pendingCaret.current = next.caret;
      typing.current = true;
      setQuery(next.text);
      setSuggestions([]);
      setOpen(false);
      combo.reset();
      return;
    }
    setQuery(pilot.name);
    seededId.current = pilot.characterId;
    typing.current = false;
    setOpen(false);
    combo.reset();
    setResolve({ kind: 'idle' });
    onSelect(pilot);
  }

  async function lookUpExactName() {
    if (exact === '') return;
    const ticket = ++latestLookup.current;
    setOpen(false);
    setResolve({ kind: 'resolving' });
    try {
      const pilot = await resolvePilotByName(exact);
      if (ticket !== latestLookup.current) return;
      if (pilot === null) setResolve({ kind: 'not-found', name: exact });
      else choose(pilot);
    } catch {
      if (ticket === latestLookup.current) setResolve({ kind: 'failed' });
    }
  }

  function submit() {
    const names = namesOf(query);
    if (names.length >= 2) {
      const pasted = classifyPilotPaste(names.join('\n'));
      setOpen(false);
      if (pasted === null) {
        setResolve({ kind: 'bad-lines' });
        return;
      }
      setResolve({ kind: 'idle' });
      onList(pasted);
      return;
    }
    const picked = combo.highlight === null ? undefined : shown[combo.highlight];
    if (open && picked) choose(picked);
    else void lookUpExactName();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      combo.reset();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const picked = combo.highlight === null ? undefined : shown[combo.highlight];
      if (open && picked) {
        e.preventDefault();
        choose(picked);
      } else if (!multi && !hasCoarsePointer()) {
        e.preventDefault();
        submit();
      }
      return;
    }
    if (combo.handleNavKey(e)) setOpen(true);
  }

  const label = t('travel.pilot.searchLabel');

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label={label} stretch={false}>
            <div className="relative w-72 max-w-full">
              <TextArea
                ref={areaRef}
                rows={Math.min(6, Math.max(1, query.split('\n').length))}
                {...combo.inputProps}
                aria-label={label}
                placeholder={t('travel.pilot.searchPlaceholder')}
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  latestLookup.current++;
                  typing.current = true;
                  setQuery(e.target.value);
                  setCaret(e.target.selectionStart);
                  setSuggestions([]);
                  setOpen(true);
                  combo.reset();
                  setResolve({ kind: 'idle' });
                }}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                onSubmitChord={submit}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                  typing.current = false;
                  setOpen(false);
                }}
                onPaste={(e) => {
                  const pasted = classifyPilotPaste(e.clipboardData.getData('text/plain'));
                  if (pasted === null) return;
                  e.preventDefault();
                  onList(pasted);
                }}
                onKeyDown={handleKeyDown}
                className="block min-h-9 w-full py-1.5"
              />
              {listOpen && (
                <ul
                  {...combo.listboxProps}
                  aria-label={t('travel.pilot.suggestionsLabel')}
                  className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xs border border-line bg-panel shadow-lg"
                >
                  {shown.map((pilot, i) => (
                    <li
                      key={pilot.characterId}
                      {...combo.optionProps(i)}
                      className={cx(
                        'cursor-pointer px-3 py-1.5 text-xs text-text',
                        rowInteractiveClassName,
                        i === combo.activeIndex && `bg-panel-2 ${activeOptionClassName}`
                      )}
                      onMouseEnter={() => combo.setHighlight(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(pilot);
                      }}
                    >
                      {pilot.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </FilterField>
          <Tooltip content={exact === '' ? t('travel.pilot.lookUpEmpty') : null}>
            <Button
              type="submit"
              variant="primary"
              loading={resolve.kind === 'resolving'}
              aria-disabled={exact === '' || undefined}
            >
              {t('travel.pilot.lookUp')}
            </Button>
          </Tooltip>
          {list !== null && (
            <Button type="button" onClick={() => onList(null)}>
              {t('travel.pilot.list.clear')}
            </Button>
          )}
          {list?.kind === 'local' && (
            <span className="self-center text-sm text-text-dim">
              {t('travel.pilot.list.tokenLocal', { count: list.names.length + list.overflow })}
            </span>
          )}
          {list?.kind === 'dscan' && (
            <div className="ml-auto flex max-w-full flex-wrap justify-end gap-2 self-start">
              <DscanShareControl paste={list} characterId={activeCharacterId} />
            </div>
          )}
        </div>
        <p className="text-xs text-text-dim">
          {t(canSuggest ? 'travel.pilot.searchHintSuggest' : 'travel.pilot.searchHintExact', {
            context: touchCtx,
          })}
        </p>
        <p role="status" aria-live="polite" className="text-xs">
          {resolve.kind === 'resolving' && t('travel.pilot.resolving')}
          {resolve.kind === 'not-found' && t('travel.pilot.notFound', { name: resolve.name })}
          {resolve.kind === 'bad-lines' && t('travel.pilot.linesInvalid')}
          {resolve.kind === 'failed' && t('travel.pilot.resolveFailed')}
        </p>
      </form>
    </div>
  );
}

type ProfileState =
  | { kind: 'loading' }
  | { kind: 'unknown' }
  | { kind: 'failed' }
  | { kind: 'ready'; profile: PilotProfile };

function PilotResult({
  characterId,
  onResolved,
}: {
  characterId: number;
  onResolved: (pilot: PilotSummary) => void;
}) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProfileState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadPilotProfile(characterId)
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded === null ? { kind: 'unknown' } : { kind: 'ready', profile: loaded });
        if (loaded !== null) onResolved({ characterId, name: loaded.name });
      })
      .catch(() => {
        if (!cancelled) setProfile({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [characterId, attempt, onResolved]);

  const [resultRef, , holdFocus] = useRetryFocus<HTMLDivElement>(
    profile.kind === 'loading' ? 'busy' : profile.kind === 'failed' ? 'failed' : 'ok',
    null
  );

  function retry() {
    holdFocus();
    setProfile({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }

  const wrap = (children: ReactNode) => (
    <div ref={resultRef} tabIndex={-1} className="outline-none">
      {children}
    </div>
  );

  if (profile.kind === 'loading') {
    return wrap(
      <div className="flex justify-center py-10">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (profile.kind === 'failed') {
    return wrap(
      <EmptyState
        title={t('travel.pilot.profileFailedTitle')}
        hint={t('travel.pilot.profileFailedHint')}
        action={
          <Button size="sm" onClick={retry}>
            {t('travel.pilot.retry')}
          </Button>
        }
      />
    );
  }
  if (profile.kind === 'unknown') {
    return wrap(
      <EmptyState title={t('travel.pilot.unknownTitle')} hint={t('travel.pilot.unknownHint')} />
    );
  }
  return wrap(
    <Panel actions={<DataAgeBadge date={profile.profile.fetchedAt} alwaysVisible />}>
      <PilotProfileView profile={profile.profile} />
    </Panel>
  );
}
