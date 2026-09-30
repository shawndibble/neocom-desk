/**
 * Travel › Pilot Lookup (issue #2331): search a pilot by name and see who they
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
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CharacterAvatar,
  EmptyState,
  FilterField,
  PageHeader,
  Panel,
  Spinner,
  TextInput,
  TypeIcon,
} from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import {
  MIN_RECIPIENT_SEARCH_LENGTH,
  searchMailRecipients,
} from '@/features/character/mailRecipientSearch';
import { loadTypeNames } from '@/features/character/typeNames';
import { moveHighlight } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { optionalIdParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { characterZkillUrl, fetchPilotStats, type PilotStatsResult } from '@/lib/zkillboard';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { openPublicInfoModal } from '@/stores/publicInfoModal';
import { PilotKillmailsSection } from './PilotKillmailsSection';
import {
  loadPilotProfile,
  pilotAge,
  resolvePilotByName,
  type PilotProfile,
  type PilotSummary,
} from './pilotLookup';

const PILOT_PARAMS = { pilot: optionalIdParam() };
const SEARCH_ENDPOINTS = ['getCharacterSearch'] as const;
/** Same debounce as Mail's recipient search, which calls the same ESI search. */
const SEARCH_DEBOUNCE_MS = 300;

export function PilotLookupTab({ tabBar }: { tabBar: ReactNode }) {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(PILOT_PARAMS);

  return (
    <div className="space-y-4">
      <PageHeader title={t('travel.title')} />
      {tabBar}
      <Panel>
        <PilotSearch
          onSelect={(pilot) => setParams({ pilot: pilot.characterId }, { push: true })}
        />
      </Panel>
      {params.pilot === null ? (
        <EmptyState title={t('travel.pilot.pickTitle')} hint={t('travel.pilot.pickHint')} />
      ) : (
        <PilotResult key={params.pilot} characterId={params.pilot} />
      )}
    </div>
  );
}

type ResolveState =
  | { kind: 'idle' }
  | { kind: 'resolving' }
  | { kind: 'not-found'; name: string }
  | { kind: 'failed' };

function PilotSearch({ onSelect }: { onSelect: (pilot: PilotSummary) => void }) {
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
                setQuery(e.target.value);
                setSuggestions([]);
                setOpen(true);
                setHighlight(null);
                setResolve({ kind: 'idle' });
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
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
                      highlight === i ? 'bg-panel-2' : 'hover:bg-panel-2/60'
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
function PilotResult({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProfileState>({ kind: 'loading' });
  const [stats, setStats] = useState<PilotStatsResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPilotProfile(characterId)
      .then((loaded) => {
        if (!cancelled)
          setProfile(loaded === null ? { kind: 'unknown' } : { kind: 'ready', profile: loaded });
      })
      .catch(() => {
        if (!cancelled) setProfile({ kind: 'failed' });
      });
    void fetchPilotStats(characterId).then((result) => {
      if (!cancelled) setStats(result);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

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
      <div className="space-y-4">
        <PilotIdentity profile={profile.profile} />
        <PilotStatsSection stats={stats} />
        <PilotKillmailsSection characterId={profile.profile.characterId} />
      </div>
    </Panel>
  );
}

function PilotIdentity({ profile }: { profile: PilotProfile }) {
  const { t } = useTranslation();
  // Rendered once per lookup; "now" for an age in years and days needs no ticking.
  const [now] = useState(() => new Date());
  const age = pilotAge(profile.birthday, now);
  const { allianceId } = profile;
  return (
    <div className="flex flex-wrap items-start gap-4">
      <CharacterAvatar characterId={profile.characterId} size="lg" alt={profile.name} />
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold text-text">{profile.name}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-text-dim">{t('travel.pilot.corporation')}</dt>
          <dd>
            <button
              type="button"
              className={inlineLinkClassName}
              onClick={() => openPublicInfoModal('corporation', profile.corporationId)}
            >
              {profile.corporationName ?? t('travel.pilot.unnamed', { id: profile.corporationId })}
            </button>
          </dd>
          <dt className="text-text-dim">{t('travel.pilot.alliance')}</dt>
          <dd>
            {allianceId === null ? (
              t('travel.pilot.noAlliance')
            ) : (
              <button
                type="button"
                className={inlineLinkClassName}
                onClick={() => openPublicInfoModal('alliance', allianceId)}
              >
                {profile.allianceName ?? t('travel.pilot.unnamed', { id: allianceId })}
              </button>
            )}
          </dd>
          <dt className="text-text-dim">{t('travel.pilot.age')}</dt>
          <dd>
            {age === null
              ? t('common.unknown')
              : t('travel.pilot.ageValue', {
                  years: t('travel.pilot.years', { count: age.years }),
                  days: t('travel.pilot.days', { count: age.days }),
                })}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-3 pt-1 text-sm">
          <button
            type="button"
            className={inlineLinkClassName}
            onClick={() => openPublicInfoModal('character', profile.characterId)}
          >
            {t('travel.pilot.publicInfo')}
          </button>
          <a
            href={characterZkillUrl(profile.characterId)}
            target="_blank"
            rel="noopener noreferrer"
            className={inlineLinkClassName}
          >
            {t('travel.pilot.zkillboard')}
          </a>
        </div>
      </div>
    </div>
  );
}

/** A 0-1 share as a percentage; zKillboard's ratios are already 0-100, so they pass `scale` 1. */
function percent(value: number | null, digits = 0, scale = 100): string {
  return value === null ? '—' : `${(value * scale).toFixed(digits)}%`;
}

function PilotStatsSection({ stats }: { stats: PilotStatsResult | null }) {
  const { t } = useTranslation();
  if (stats === null) {
    return (
      <p role="status" className="text-text-dim">
        {t('travel.pilot.statsLoading')}
      </p>
    );
  }
  if (stats.kind === 'failed') {
    return (
      <EmptyState
        title={t('travel.pilot.statsFailedTitle')}
        hint={t('travel.pilot.statsFailedHint')}
      />
    );
  }
  if (stats.kind === 'no-history') {
    return (
      <EmptyState title={t('travel.pilot.noHistoryTitle')} hint={t('travel.pilot.noHistoryHint')} />
    );
  }
  const s = stats.stats;
  const figures: [string, string][] = [
    [t('travel.pilot.kills'), s.kills.toLocaleString()],
    [t('travel.pilot.losses'), s.losses.toLocaleString()],
    [t('travel.pilot.iskDestroyed'), formatIskCompact(s.iskDestroyed)],
    [t('travel.pilot.iskLost'), formatIskCompact(s.iskLost)],
    [t('travel.pilot.iskEfficiency'), percent(s.iskEfficiency, 1)],
    [t('travel.pilot.soloKills'), s.soloKills.toLocaleString()],
    [t('travel.pilot.dangerRatio'), percent(s.dangerRatio, 0, 1)],
    [t('travel.pilot.gangRatio'), percent(s.gangRatio, 0, 1)],
  ];
  return (
    <section aria-label={t('travel.pilot.statsLabel')} className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {figures.map(([label, value]) => (
          <div key={label} className="rounded-xs border border-line bg-panel-2 px-3 py-2">
            <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {label}
            </dt>
            <dd className="text-base font-medium tabular-nums text-text">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-text-dim">{t('travel.pilot.statsSource')}</p>
      {s.topShips.length > 0 && <TopShips ships={s.topShips} />}
    </section>
  );
}

function TopShips({ ships }: { ships: { shipTypeId: number; kills: number }[] }) {
  const { t } = useTranslation();
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const ids = ships.map((ship) => ship.shipTypeId).join(',');
  useEffect(() => {
    let cancelled = false;
    void loadTypeNames(ids.split(',').map(Number))
      .then((loaded) => {
        if (!cancelled) setNames(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ids]);
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
        {t('travel.pilot.topShips')}
      </h3>
      <ul className="space-y-1">
        {ships.map((ship) => (
          <li key={ship.shipTypeId} className="flex items-center gap-2 text-sm">
            <TypeIcon typeId={ship.shipTypeId} size={32} width={24} height={24} />
            <span className="text-text">
              {names.get(ship.shipTypeId) ?? t('common.unknownType', { id: ship.shipTypeId })}
            </span>
            <span className="text-text-dim tabular-nums">
              {t('travel.pilot.shipKills', {
                count: ship.kills,
                formatted: ship.kills.toLocaleString(),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
