/**
 * Pilot Lookup (issue #2331): search a pilot by name and see who they
 * are (public ESI) and what zKillboard states about their kills and losses.
 *
 * Numbers, never verdicts (decision `20260912-172628`): the card states a
 * danger ratio of 68%, it never calls the pilot hostile or safe.
 *
 * The selected pilot lives in the URL (`?pilot=<id>`) so a lookup can be shared.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
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
} from '@/components/ui';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import {
  MIN_RECIPIENT_SEARCH_LENGTH,
  searchMailRecipients,
} from '@/features/character/mailRecipientSearch';
import { isMultiLine, lineAt, namesOf, replaceLine } from '@/engine/pilotList/nameLines';
import { classifyPilotPaste, type PilotPaste } from '@/engine/pilotList/parsePilotPaste';
import { moveHighlight } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { useTouchContext } from '@/lib/useMediaQuery';
import type { PilotListState } from '@/lib/shortcuts';
import { optionalIdParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { useActiveCharacter } from '@/stores/activeCharacter';
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

const PILOT_PARAMS = { pilot: optionalIdParam() };
const SEARCH_ENDPOINTS = ['getCharacterSearch'] as const;
/** Same debounce as Mail's recipient search, which calls the same ESI search. */
const SEARCH_DEBOUNCE_MS = 300;

export function PilotLookupPanel() {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(PILOT_PARAMS);
  const [resolved, setResolved] = useState<PilotSummary | null>(null);
  const location = useLocation();
  // The pasted list lives here, not in the URL, so it survives a trip to one
  // pilot (`?pilot=`) and Back; the global paste router hands it over in route state.
  const [list, setList] = useState<PilotPaste | null>(null);
  const [handledListKey, setHandledListKey] = useState<string | null>(null);
  // "Open Neocom Desk" on a Shared D-Scan arrives as `?share=<id>`.
  useSharedDscanSeed((text) => {
    const pasted = classifyPilotPaste(text);
    if (pasted !== null) setList(pasted);
  });

  // Adopted during render, once per navigation (`location.key`), rather than in an effect.
  const routedText = (location.state as Partial<PilotListState> | null)?.pilotListText;
  if (routedText && handledListKey !== location.key) {
    setHandledListKey(location.key);
    const pasted = classifyPilotPaste(routedText);
    if (pasted !== null) setList(pasted);
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.pilotLookup')} />
      <Panel>
        <PilotSearch
          resolved={resolved !== null && resolved.characterId === params.pilot ? resolved : null}
          list={list}
          onList={setList}
          onSelect={(pilot) => {
            setList(null);
            setParams({ pilot: pilot.characterId }, { push: true });
          }}
        />
      </Panel>
      {params.pilot === null && list !== null ? (
        <PilotListView paste={list} />
      ) : params.pilot === null ? (
        <EmptyState title={t('travel.pilot.pickTitle')} hint={t('travel.pilot.pickHint')} />
      ) : (
        <PilotResult key={params.pilot} characterId={params.pilot} onResolved={setResolved} />
      )}
    </div>
  );
}

type ResolveState =
  | { kind: 'idle' }
  | { kind: 'resolving' }
  | { kind: 'not-found'; name: string }
  /** A line of a several-line list doesn't look like a pilot name. */
  | { kind: 'bad-lines' }
  | { kind: 'failed' };

/** A phone keyboard has no Shift+Enter, so there Enter always adds a line. */
function hasCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

function PilotSearch({
  resolved,
  list,
  onList,
  onSelect,
}: {
  /** The pilot in the URL once its profile has loaded. */
  resolved: PilotSummary | null;
  list: PilotPaste | null;
  onList: (paste: PilotPaste | null) => void;
  onSelect: (pilot: PilotSummary) => void;
}) {
  const { t } = useTranslation();
  const touchCtx = useTouchContext();
  const listboxId = useId();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const canSuggest = useEndpointsGranted(SEARCH_ENDPOINTS) === true && activeCharacterId !== null;
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PilotSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [resolve, setResolve] = useState<ResolveState>({ kind: 'idle' });
  // Only the newest search may write results: ESI can answer out of order.
  const latestSearch = useRef(0);
  // Likewise for an exact-name lookup: typing again supersedes one in flight.
  const latestLookup = useRef(0);
  // The pilot whose name the box last showed, and whether the user is editing it.
  const seededId = useRef<number | null>(null);
  const typing = useRef(false);
  // The box takes one name per line; suggestions are for the line the caret is on.
  const [caret, setCaret] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    // The pilot left the URL: coming back to it must seed again, even over edited text.
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
  // The name being typed is the caret's line: it alone gets suggestions.
  const trimmed = lineAt(query, caret).text.trim();
  const shown = canSuggest && trimmed.length >= MIN_RECIPIENT_SEARCH_LENGTH ? suggestions : [];

  useEffect(() => {
    if (!canSuggest || activeCharacterId === null) return;
    if (trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH) return;
    // A seeded or chosen name is already a pilot; only the user's typing asks ESI for matches.
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
          // An aborted search is superseded, not failed; a real failure still leaves exact-name lookup.
          if (ticket !== latestSearch.current || controller.signal.aborted) return;
          setSuggestions([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [canSuggest, activeCharacterId, trimmed]);

  // After a pick fills a line of a list, the caret goes to the end of that line.
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    areaRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    setCaret(pendingCaret.current);
    pendingCaret.current = null;
  }, [query]);

  function choose(pilot: PilotSummary) {
    if (multi) {
      // Part of a list: fill the line being typed, and look the list up when asked.
      const next = replaceLine(query, caret, pilot.name);
      pendingCaret.current = next.caret;
      typing.current = true;
      setQuery(next.text);
      setSuggestions([]);
      setOpen(false);
      setHighlight(null);
      return;
    }
    setQuery(pilot.name);
    seededId.current = pilot.characterId;
    typing.current = false;
    setOpen(false);
    setHighlight(null);
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

  /** One name looks that pilot up; several lines look the whole list up. */
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
    const picked = highlight === null ? undefined : shown[highlight];
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
      setHighlight(null);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const picked = highlight === null ? undefined : shown[highlight];
      if (open && picked) {
        e.preventDefault();
        choose(picked);
      } else if (!multi && !hasCoarsePointer()) {
        // One name: Enter looks it up. Shift+Enter starts a list; once there is
        // one, Enter adds a line and Ctrl+Enter looks the list up. A phone's
        // Enter always adds a line, so its Look up button is the way.
        e.preventDefault();
        submit();
      }
      return;
    }
    const key = e.key;
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      if (shown.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((current) => moveHighlight(key, current, shown.length));
    }
  }

  const listOpen = open && shown.length > 0;
  const label = t('travel.pilot.searchLabel');

  return (
    <div className="space-y-3">
      {list !== null && (
        // The paste collapsed to a token, not a wall of text. The search box stays
        // below it, so one pilot can be looked up without clearing the list first.
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-text">
            {list.kind === 'local'
              ? t('travel.pilot.list.tokenLocal', { count: list.names.length + list.overflow })
              : t('travel.pilot.list.tokenDscan', { count: list.typeIds.length })}
          </span>
          {list.kind === 'dscan' && (
            <DscanShareControl paste={list} characterId={activeCharacterId} />
          )}
          <Button type="button" size="sm" onClick={() => onList(null)}>
            {t('travel.pilot.list.clear')}
          </Button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label={label} stretch={false}>
            <div className="relative w-72 max-w-full">
              <TextArea
                ref={areaRef}
                rows={Math.min(6, Math.max(1, query.split('\n').length))}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={listOpen}
                aria-controls={listOpen ? listboxId : undefined}
                aria-activedescendant={
                  listOpen && highlight !== null ? `${listboxId}-option-${highlight}` : undefined
                }
                aria-label={label}
                placeholder={t('travel.pilot.searchPlaceholder')}
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  // Typing supersedes a lookup in flight, and another query's hits must not linger.
                  latestLookup.current++;
                  typing.current = true;
                  setQuery(e.target.value);
                  setCaret(e.target.selectionStart);
                  setSuggestions([]);
                  setOpen(true);
                  setHighlight(null);
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
                className="block w-full"
              />
              {listOpen && (
                <ul
                  id={listboxId}
                  role="listbox"
                  aria-label={t('travel.pilot.suggestionsLabel')}
                  className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xs border border-line bg-panel shadow-lg"
                >
                  {shown.map((pilot, i) => (
                    <li
                      key={pilot.characterId}
                      id={`${listboxId}-option-${i}`}
                      role="option"
                      aria-selected={highlight === i}
                      className={cx(
                        'cursor-pointer px-3 py-1.5 text-xs text-text',
                        'hover:bg-panel-2',
                        highlight === i && 'bg-panel-2'
                      )}
                      onMouseEnter={() => setHighlight(i)}
                      // Keeps the input focused — a plain click would blur it first and close the list.
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
          <Button
            type="submit"
            variant="primary"
            disabled={exact === '' || resolve.kind === 'resolving'}
          >
            {t('travel.pilot.lookUp')}
          </Button>
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
  | { kind: 'ready'; profile: PilotProfile; fetchedAt: Date };

/** Mounted per pilot (keyed by id), so each lookup starts from `loading` with nothing stale. */
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
        setProfile(
          loaded === null
            ? { kind: 'unknown' }
            : { kind: 'ready', profile: loaded, fetchedAt: new Date() }
        );
        if (loaded !== null) onResolved({ characterId, name: loaded.name });
      })
      .catch(() => {
        if (!cancelled) setProfile({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [characterId, attempt, onResolved]);

  function retry() {
    setProfile({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }

  if (profile.kind === 'loading') {
    return (
      <div className="flex justify-center py-10">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (profile.kind === 'failed') {
    return (
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
    return (
      <EmptyState title={t('travel.pilot.unknownTitle')} hint={t('travel.pilot.unknownHint')} />
    );
  }
  return (
    <Panel actions={<DataAgeBadge date={profile.fetchedAt} alwaysVisible />}>
      <PilotProfileView profile={profile.profile} />
    </Panel>
  );
}
