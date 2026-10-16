/**
 * "Your Characters": who can fly the open Fitting, what each is missing and
 * how long it takes to train. Built for 20+ Characters — chips, a search box
 * and one sortable table, closest to flying first; a row opens in place to
 * list that Character's missing skills. The rows come from
 * `useCharacterGaps`, which only works anything out while the section is open.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FilterChip, SearchInput, type DataTableColumn } from '@/components/ui';
import { romanLevel } from '@/engine/projection';
import { formatCountdown } from '@/lib/duration';
import { StatNote } from './StatFacts';
import type { CharacterGapRow } from './useCharacterGaps';

type Filter = 'all' | 'fly' | 'cant';

const LAST = Number.MAX_SAFE_INTEGER;
/** Still working out sorts after the answered rows, before the ones that can't be answered. */
const PENDING = LAST - 1;

const isFly = (row: CharacterGapRow) => row.state === 'ready' && row.gap.missingCount === 0;
const isCant = (row: CharacterGapRow) => row.state === 'ready' && row.gap.missingCount > 0;

export function FittingYourCharactersPanel({ rows }: { rows: readonly CharacterGapRow[] }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const flyCount = rows.filter(isFly).length;
  const cantCount = rows.filter(isCant).length;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter(
        (row) =>
          (filter === 'all' || (filter === 'fly' ? isFly(row) : isCant(row))) &&
          row.name.toLowerCase().includes(needle)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, filter, query]);

  const columns: DataTableColumn<CharacterGapRow>[] = [
    {
      id: 'name',
      header: t('fittings.yourCharacters.character'),
      render: (row) => row.name,
      sortValue: (row) => row.name.toLowerCase(),
    },
    {
      id: 'missing',
      header: t('fittings.yourCharacters.missing'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) =>
        row.state === 'unloaded' ? (
          <span className="text-text-dim">{t('fittings.yourCharacters.notLoaded')}</span>
        ) : row.state === 'pending' ? (
          <span className="text-text-dim">{t('common.loading')}</span>
        ) : row.gap.missingCount === 0 ? (
          <span className="text-success">{t('fittings.yourCharacters.canFly')}</span>
        ) : (
          t('fittings.yourCharacters.skills', { count: row.gap.missingCount })
        ),
      sortValue: (row) =>
        row.state === 'unloaded' ? LAST : row.state === 'pending' ? PENDING : row.gap.missingCount,
    },
    {
      id: 'time',
      header: t('fittings.yourCharacters.toTrain'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) =>
        row.state === 'ready' && row.gap.totalSeconds > 0
          ? formatCountdown(row.gap.totalSeconds)
          : '—',
      sortValue: (row) =>
        row.state === 'unloaded' ? LAST : row.state === 'pending' ? PENDING : row.gap.totalSeconds,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label={t('fittings.yourCharacters.all')}
          count={rows.length}
          selected={filter === 'all'}
          onToggle={() => setFilter('all')}
        />
        <FilterChip
          label={t('fittings.yourCharacters.canFly')}
          count={flyCount}
          selected={filter === 'fly'}
          onToggle={() => setFilter('fly')}
        />
        <FilterChip
          label={t('fittings.yourCharacters.cantFly')}
          count={cantCount}
          selected={filter === 'cant'}
          onToggle={() => setFilter('cant')}
        />
      </div>
      <SearchInput
        className="w-full"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('fittings.yourCharacters.search')}
        aria-label={t('fittings.yourCharacters.search')}
      />
      {shown.length === 0 ? (
        <StatNote>{t('fittings.yourCharacters.none')}</StatNote>
      ) : (
        <DataTable
          label={t('fittings.yourCharacters.tableLabel')}
          columns={columns}
          rows={shown}
          rowKey={(row) => row.characterId}
          density="compact"
          responsive="table"
          defaultSort={{ columnId: 'time', direction: 'asc' }}
          expandableRow={{
            renderDetail: (row) =>
              row.state !== 'ready' || row.gap.skills.length === 0 ? null : (
                <ul className="space-y-1 py-1 text-xs">
                  {row.gap.skills.map((skill) => (
                    <li key={skill.skillTypeID} className="flex justify-between gap-4">
                      <span>
                        {row.gap.names.get(skill.skillTypeID)} {romanLevel(skill.targetLevel)}
                        {!skill.direct && (
                          <span className="text-text-dim">
                            {' '}
                            {t('fittings.yourCharacters.prerequisite')}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-text-dim">
                        {formatCountdown(skill.seconds)}
                      </span>
                    </li>
                  ))}
                </ul>
              ),
          }}
        />
      )}
    </div>
  );
}
