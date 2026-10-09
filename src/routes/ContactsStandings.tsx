import { useCallback, useEffect, useRef, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
  StandingIcon,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { loadCharacterStandingsResult } from '@/features/character/standings';
import { resolveNames } from '@/features/character/names';
import {
  buildNpcStandingRows,
  feeOwnerIds,
  filterNpcStandingRows,
  type NpcStandingRow,
} from '@/features/character/npcStandingsRows';
import { useUrlSort } from '@/lib/useUrlState';

const STANDINGS_SORT = { columnId: 'standing', direction: 'desc' } as const;
const COLUMN_IDS = ['name', 'kind', 'standing', 'fees'] as const;
const FEE_OWNERS = feeOwnerIds();

/** The Contacts page's Standings tab (issue #2859): the Character's NPC faction, corp and agent standings. */
export function ContactsStandings({
  characterId,
  tabBar,
}: {
  characterId: number;
  /** The page's tab strip, placed between the header and the body like the other tabs. */
  tabBar: ReactNode;
}) {
  const { t } = useTranslation();
  const lacksScope = useCharacterLacksEndpoints(characterId, ['getCharacterStandings']);
  const [state, setState] = useState<{
    characterId: number;
    rows: NpcStandingRow[];
    failed: boolean;
    fetchedAt: Date | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const sortProps = useUrlSort('standings.sort', STANDINGS_SORT, COLUMN_IDS);

  const fetchState = useCallback(
    async (force: boolean) => {
      try {
        const { entries, fetchedAt } = await loadCharacterStandingsResult(characterId, { force });
        const names = await resolveNames(entries.map((entry) => entry.from_id)).catch(
          () => new Map<number, string>()
        );
        return {
          characterId,
          rows: buildNpcStandingRows(entries, names, FEE_OWNERS),
          failed: false,
          fetchedAt,
        };
      } catch {
        return { characterId, rows: [], failed: true, fetchedAt: null };
      }
    },
    [characterId]
  );

  useEffect(() => {
    let cancelled = false;
    void fetchState(false).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchState]);

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
      // A failed refresh keeps the rows already on screen rather than blanking them.
      setState((prev) => (next.failed && prev?.characterId === startedFor ? prev : next));
      setRefreshing(false);
    });
  };

  const rows = useMemo(() => filterNpcStandingRows(state?.rows ?? [], text), [state?.rows, text]);
  const columns = useMemo<DataTableColumn<NpcStandingRow>[]>(
    () => [
      {
        id: 'name',
        header: t('contacts.name'),
        primary: true,
        render: (row) => row.name,
        sortValue: (row) => row.name,
      },
      {
        id: 'kind',
        header: t('contacts.type'),
        render: (row) => t(`contacts.standingsKind.${row.kind}`),
        sortValue: (row) => row.kind,
      },
      {
        id: 'standing',
        header: t('contacts.standing'),
        align: 'center',
        cardCorner: true,
        render: (row) => (
          <span className="inline-flex items-center gap-1.5">
            <StandingIcon value={row.standing} />
            <span className="tabular-nums">{row.standing.toFixed(2)}</span>
          </span>
        ),
        sortValue: (row) => row.standing,
      },
      {
        id: 'fees',
        header: t('contacts.standingsUsedForFees'),
        render: (row) =>
          row.usedForFees ? t('contacts.standingsUsedForFeesYes') : <span data-dense-omit />,
        sortValue: (row) => (row.usedForFees ? 1 : 0),
      },
    ],
    [t]
  );

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
  } else if (!state || state.characterId !== characterId || refreshing) {
    content = (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  } else if (state.failed) {
    content = <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />;
  } else if (state.rows.length === 0) {
    content = (
      <EmptyState
        title={t('contacts.standingsEmptyTitle')}
        hint={t('contacts.standingsEmptyHint')}
      />
    );
  } else {
    content = (
      <div className="space-y-3">
        <SearchInput
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('contacts.searchPlaceholder')}
          aria-label={t('contacts.searchPlaceholder')}
          className="max-w-sm"
        />
        <p className="text-xs text-text-dim">{t('contacts.standingsFeesNote')}</p>
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
            />
          )}
        </Panel>
      </div>
    );
  }

  const ready = !lacksScope && state?.characterId === characterId && !state.failed;
  return (
    <>
      <PageHeader
        title={t('contacts.title')}
        meta={ready && state.fetchedAt && <DataAgeBadge date={state.fetchedAt} />}
        actions={
          !lacksScope && (
            <IconButton
              icon={<Icon.Refresh />}
              label={t('contacts.refresh')}
              onClick={refresh}
              disabled={refreshing || !state || state.characterId !== characterId}
            />
          )
        }
      />
      {tabBar}
      {content}
    </>
  );
}
