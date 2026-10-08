import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  EmptyState,
  Panel,
  SearchInput,
  Spinner,
  StandingIcon,
  type DataTableColumn,
} from '@/components/ui';
import { GrantBanner } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { loadCharacterStandings } from '@/features/character/standings';
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
export function ContactsStandings({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const lacksScope = useCharacterLacksEndpoints(characterId, ['getCharacterStandings']);
  const [state, setState] = useState<{
    characterId: number;
    rows: NpcStandingRow[];
    failed: boolean;
  } | null>(null);
  const [text, setText] = useState('');
  const sortProps = useUrlSort('standings.sort', STANDINGS_SORT, COLUMN_IDS);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const entries = await loadCharacterStandings(characterId);
        const names = await resolveNames(entries.map((entry) => entry.from_id)).catch(
          () => new Map<number, string>()
        );
        if (cancelled) return;
        setState({
          characterId,
          rows: buildNpcStandingRows(entries, names, FEE_OWNERS),
          failed: false,
        });
      } catch {
        if (!cancelled) setState({ characterId, rows: [], failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

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
        render: (row) => (row.usedForFees ? t('contacts.standingsUsedForFeesYes') : null),
        sortValue: (row) => (row.usedForFees ? 1 : 0),
      },
    ],
    [t]
  );

  if (lacksScope) {
    return (
      <GrantBanner
        characterId={characterId}
        endpoints={['getCharacterStandings']}
        title={t('contacts.standingsReauthTitle')}
        hint={t('contacts.standingsReauthHint')}
        actionLabel={t('contacts.reauthAction')}
      />
    );
  }
  if (!state || state.characterId !== characterId) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (state.failed) {
    return <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />;
  }
  if (state.rows.length === 0) {
    return (
      <EmptyState
        title={t('contacts.standingsEmptyTitle')}
        hint={t('contacts.standingsEmptyHint')}
      />
    );
  }

  return (
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
