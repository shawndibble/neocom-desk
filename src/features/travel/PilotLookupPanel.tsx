/**
 * Pilot Lookup (issue #2331): search a pilot by name and see who they
 * are (public ESI) and what zKillboard states about their kills and losses.
 *
 * Numbers, never verdicts (decision `20260912-172628`): the card states a
 * danger ratio of 68%, it never calls the pilot hostile or safe.
 *
 * The selected pilot lives in the URL (`?pilot=<id>`) so a lookup can be shared.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  FilterField,
  PageHeader,
  Panel,
  Spinner,
  TextInput,
} from '@/components/ui';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import {
  MIN_RECIPIENT_SEARCH_LENGTH,
  searchMailRecipients,
} from '@/features/character/mailRecipientSearch';
import { moveHighlight } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
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
import { PilotProfileView } from './PilotProfileView';

const PILOT_PARAMS = { pilot: optionalIdParam() };
const SEARCH_ENDPOINTS = ['getCharacterSearch'] as const;
/** Same debounce as Mail's recipient search, which calls the same ESI search. */
const SEARCH_DEBOUNCE_MS = 300;

export function PilotLookupPanel() {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(PILOT_PARAMS);
  const [resolved, setResolved] = useState<PilotSummary | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.pilotLookup')} />
      <Panel>
        <PilotSearch
          resolved={resolved !== null && resolved.characterId === params.pilot ? resolved : null}
          onSelect={(pilot) => setParams({ pilot: pilot.characterId }, { push: true })}
        />
      </Panel>
      {params.pilot === null ? (
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
  | { kind: 'failed' };

function PilotSearch({
  resolved,
  onSelect,
}: {
  /** The pilot in the URL once its profile has loaded. */
  resolved: PilotSummary | null;
  onSelect: (pilot: PilotSummary) => void;
}) {
  const { t } = useTranslation();
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

  useEffect(() => {
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

  const trimmed = query.trim();
  const shown = canSuggest && trimmed.length >= MIN_RECIPIENT_SEARCH_LENGTH ? suggestions : [];

  useEffect(() => {
    if (!canSuggest || activeCharacterId === null) return;
    if (trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH) return;
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

  function choose(pilot: PilotSummary) {
    setQuery(pilot.name);
    seededId.current = pilot.characterId;
    typing.current = false;
    setOpen(false);
    setHighlight(null);
    setResolve({ kind: 'idle' });
    onSelect(pilot);
  }

  async function lookUpExactName() {
    if (trimmed === '') return;
    const ticket = ++latestLookup.current;
    setOpen(false);
    setResolve({ kind: 'resolving' });
    try {
      const pilot = await resolvePilotByName(trimmed);
      if (ticket !== latestLookup.current) return;
      if (pilot === null) setResolve({ kind: 'not-found', name: trimmed });
      else choose(pilot);
    } catch {
      if (ticket === latestLookup.current) setResolve({ kind: 'failed' });
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const picked = highlight === null ? undefined : shown[highlight];
    if (open && picked) choose(picked);
    else void lookUpExactName();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(null);
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
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label={label} stretch={false}>
          <div className="relative w-72 max-w-full">
            <TextInput
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
                setSuggestions([]);
                setOpen(true);
                setHighlight(null);
                setResolve({ kind: 'idle' });
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                typing.current = false;
                setOpen(false);
              }}
              onKeyDown={handleKeyDown}
              className="w-full"
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
          disabled={trimmed === '' || resolve.kind === 'resolving'}
        >
          {t('travel.pilot.lookUp')}
        </Button>
      </div>
      <p className="text-xs text-text-dim">
        {canSuggest ? t('travel.pilot.searchHintSuggest') : t('travel.pilot.searchHintExact')}
      </p>
      <p role="status" aria-live="polite" className="text-xs">
        {resolve.kind === 'resolving' && t('travel.pilot.resolving')}
        {resolve.kind === 'not-found' && t('travel.pilot.notFound', { name: resolve.name })}
        {resolve.kind === 'failed' && t('travel.pilot.resolveFailed')}
      </p>
    </form>
  );
}

type ProfileState =
  | { kind: 'loading' }
  | { kind: 'unknown' }
  | { kind: 'failed' }
  | { kind: 'ready'; profile: PilotProfile };

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
  }, [characterId, onResolved]);

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
      />
    );
  }
  if (profile.kind === 'unknown') {
    return (
      <EmptyState title={t('travel.pilot.unknownTitle')} hint={t('travel.pilot.unknownHint')} />
    );
  }
  return (
    <Panel>
      <PilotProfileView profile={profile.profile} />
    </Panel>
  );
}
