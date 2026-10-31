import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { loadCharacterStandingsResult } from '@/features/character/standings';
import { resolveNames } from '@/features/character/names';
import { type NpcStandingsColumnId } from '@/features/character/contactsColumns';
import { NpcStandingsFilterBar } from '@/features/character/NpcStandingsFilterBar';
import { loadNpcStandingsReference } from '@/features/character/npcStandingsReference';
import {
  NPC_STANDING_KINDS,
  buildNpcStandingRows,
  countNpcStandingRows,
  feeOwnerIds,
  filterNpcStandingRows,
  type NpcStandingKind,
  type NpcStandingRow,
  type NpcStandingsFilter,
} from '@/features/character/npcStandingsRows';
import { useNpcStandingsColumns } from '@/features/character/useNpcStandingsColumns';
import { openNpcInfo, type NpcInfoKind } from '@/features/standings/openNpcInfo';
import { DataGate } from '@/components/DataGate';
import {
  boolParam,
  defineUrlFilter,
  enumSetParam,
  optionalIntParam,
  textParam,
} from '@/lib/urlState';
import { filterFromParamValues, paramsPatchFromFilter, useUrlParams } from '@/lib/useUrlState';

const FEE_OWNERS = feeOwnerIds();
const INFO_KIND: Record<NpcStandingKind, NpcInfoKind> = {
  faction: 'faction',
  corp: 'corporation',
  agent: 'agent',
};

/** The filter row, in the URL (ADR 0015) under `standings.` keys that Contacts' other tabs never read. */
const FILTER_URL = defineUrlFilter<NpcStandingsFilter>({
  text: { key: 'standings.q', codec: textParam() },
  kinds: { key: 'standings.type', codec: enumSetParam(NPC_STANDING_KINDS) },
  minAccess: { key: 'standings.access', codec: optionalIntParam({ min: 2, max: 5 }) },
  feesOnly: { key: 'standings.fees', codec: boolParam() },
});

/**
 * The Contacts page's Standings tab (issue #2859): the Character's faction,
 * corporation and agent standings. A hook rather than a component so the page can
 * keep one header and tab bar mounted across all three tabs (focus stays on
 * the tab that was just chosen); `enabled` holds the fetch until the tab opens.
 */
export function useContactsStandings(characterId: number, enabled: boolean) {
  const { t } = useTranslation();
  const lacksScope = useCharacterLacksEndpoints(characterId, ['getCharacterStandings']);
  const [state, setState] = useState<{
    characterId: number;
    rows: NpcStandingRow[];
    failed: boolean;
    fetchedAt: Date | null;
    /** The rows are a cached copy: ESI did not answer. */
    fromCache: boolean;
    /** False when no list could be loaded at all — unknown, not "no standings". */
    available: boolean;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterParams, setFilterParams] = useUrlParams(FILTER_URL.schema);
  const filter = useMemo(
    () => filterFromParamValues<NpcStandingsFilter>(filterParams, FILTER_URL.fieldToParam),
    [filterParams]
  );
  // Rows derive from a deferred copy so a keystroke paints the box first
  // (`useUrlFilter`'s rule); the bar keeps the immediate one.
  const rowsFilter = useDeferredValue(filter);
  // Skills unreadable leaves every Standing empty: Base then stands in for it.
  const skillsKnown =
    !state || state.rows.length === 0 || state.rows.some((row) => row.effective !== null);
  const { columns, optionalColumns, availableIds, visibility, sortProps } =
    useNpcStandingsColumns(skillsKnown);

  const fetchState = useCallback(
    async (force: boolean) => {
      try {
        const { entries, fetchedAt, fromCache, available } = await loadCharacterStandingsResult(
          characterId,
          { force }
        );
        const reference = await loadNpcStandingsReference(
          characterId,
          entries.some((entry) => entry.from_type === 'agent')
        );
        const names = await resolveNames(entries.map((entry) => entry.from_id)).catch(
          () => new Map<number, string>()
        );
        return {
          characterId,
          rows: buildNpcStandingRows(entries, names, FEE_OWNERS, reference),
          failed: false,
          fetchedAt,
          fromCache,
          available,
        };
      } catch {
        return {
          characterId,
          rows: [],
          failed: true,
          fetchedAt: null,
          fromCache: false,
          available: false,
        };
      }
    },
    [characterId]
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchState(false).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchState, enabled]);

  // A refresh that outlives a character switch must not write the old
  // character's rows over the new one's, nor clear its loading flag.
  const currentCharacterId = useRef(characterId);
  useEffect(() => {
    currentCharacterId.current = characterId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a switch abandons the old character's refresh
    setRefreshing(false);
  }, [characterId]);

  const refresh = () => {
    const startedFor = characterId;
    setRefreshing(true);
    void fetchState(true).then((next) => {
      if (currentCharacterId.current !== startedFor) return;
      // A failed refresh keeps the rows already on screen rather than blanking
      // them; so does one that reached nothing (`available` false) when rows are up.
      setState((prev) =>
        (next.failed || !next.available) &&
        prev?.characterId === startedFor &&
        prev.available &&
        !prev.failed
          ? prev
          : next
      );
      setRefreshing(false);
    });
  };

  const unreadable =
    state !== null && state.characterId === characterId && (state.failed || !state.available);
  // A refresh keeps the rows on screen (the button is disabled meanwhile); only the
  // "couldn't load" state, which has no rows to keep, shows a spinner while it retries.
  const spinning =
    !state ||
    state.characterId !== characterId ||
    (refreshing && (state.failed || !state.available));
  const status = lacksScope ? 'ok' : spinning ? 'busy' : unreadable ? 'failed' : 'ok';

  const rows = useMemo(
    () => filterNpcStandingRows(state?.rows ?? [], rowsFilter),
    [state?.rows, rowsFilter]
  );
  const counts = useMemo(() => countNpcStandingRows(state?.rows ?? []), [state?.rows]);

  let content: ReactNode;
  if (lacksScope) {
    content = (
      <GrantBanner
        characterId={characterId}
        endpoints={['getCharacterStandings']}
        title={t('contacts.standingsReauthTitle')}
        hint={t('contacts.standingsReauthHint')}
        actionLabel={t('contacts.reauthAction')}
      />
    );
  } else if (!state || status !== 'ok') {
    // Shown by the `DataGate` below: its spinner, or "couldn't load" with Retry —
    // "no NPC standings" would be a guess when nothing was loaded.
    content = null;
  } else if (state.rows.length === 0) {
    content = (
      <div className="space-y-3">
        {state.fromCache && <CachedNotice fetchedAt={state.fetchedAt} />}
        <EmptyState
          title={t('contacts.standingsEmptyTitle')}
          hint={t('contacts.standingsEmptyHint')}
        />
      </div>
    );
  } else {
    content = (
      <div className="space-y-3">
        {state.fromCache && <CachedNotice fetchedAt={state.fetchedAt} />}
        <NpcStandingsFilterBar
          filter={filter}
          onChange={(next) => setFilterParams(paramsPatchFromFilter(next, FILTER_URL.fieldToParam))}
          counts={counts}
          columnPicker={
            <ColumnPickerMenu<NpcStandingsColumnId, NpcStandingRow>
              available={availableIds}
              visible={visibility.visible}
              columnsById={optionalColumns}
              onToggle={visibility.toggle}
              buttonLabel={t('common.columnsButton')}
              menuTitle={t('common.columnsMenuTitle')}
              onReset={visibility.reset}
              resetLabel={t('common.resetColumns')}
            />
          }
        />
        <Panel padded={false}>
          {rows.length === 0 ? (
            <EmptyState
              title={t('contacts.noResults')}
              hint={t('contacts.standingsNoResultsHint')}
              className="py-8"
            />
          ) : (
            <DataTable
              label={t('contacts.tabStandings')}
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              {...sortProps}
              mobileSort
              stackLayout="dense"
              stackSummary={t('contacts.standings.count', { count: rows.length })}
              onRowClick={(row) => openNpcInfo(INFO_KIND[row.kind], row.id)}
            />
          )}
        </Panel>
      </div>
    );
  }

  const ready =
    !lacksScope && state?.characterId === characterId && !state.failed && state.available;
  const meta = ready && state.fetchedAt && <DataAgeBadge date={state.fetchedAt} />;
  const actions = !lacksScope && (
    <IconButton
      icon={<Icon.Refresh />}
      label={t('contacts.refresh')}
      onClick={refresh}
      disabled={refreshing || !state || state.characterId !== characterId}
    />
  );
  return {
    meta,
    actions,
    content: (
      <DataGate
        status={status}
        title={t('common.couldntLoad')}
        hint={t('contacts.standingsUnavailableHint')}
        onRetry={refresh}
        resetKey={characterId}
        busy={<Spinner block="page" label={t('common.loading')} />}
      >
        {content}
      </DataGate>
    ),
  };
}
