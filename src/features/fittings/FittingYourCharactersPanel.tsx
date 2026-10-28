/**
 * "Your Characters": who can fly the open Fitting, what each is missing and
 * how long it takes to train. Built for 20+ Characters: a filter, a search
 * box and one sortable table, closest to flying first; a row opens in place.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, SearchInput, SegmentedControl, type DataTableColumn } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { romanLevel } from '@/engine/projection';
import { formatCountdown } from '@/lib/duration';
import { StatNote } from './StatFacts';
import { canFly, type CharacterGapRow } from './useCharacterGaps';
import type { FittingGap } from './fittingGapForCharacter';

type Filter = 'all' | 'fly' | 'cant';

const isCant = (row: CharacterGapRow) => row.state === 'ready' && row.gap.missingCount > 0;

/** Only answered rows rank; undefined sinks to the end whichever way the column sorts. */
const gapRank = (pick: (gap: FittingGap) => number) => (row: CharacterGapRow) =>
  row.state === 'ready' ? pick(row.gap) : undefined;

export function FittingYourCharactersPanel({ rows }: { rows: readonly CharacterGapRow[] }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const flyCount = rows.filter(canFly).length;
  const cantCount = rows.filter(isCant).length;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter(
        (row) =>
          (filter === 'all' || (filter === 'fly' ? canFly(row) : isCant(row))) &&
          row.name.toLowerCase().includes(needle)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, filter, query]);

  const columns: DataTableColumn<CharacterGapRow>[] = [
    {
      id: 'name',
      stickyStart: true,
      header: t('fittings.yourCharacters.character'),
      render: (row) => row.name,
      sortValue: (row) => row.name.toLowerCase(),
    },
    {
      id: 'missing',
      header: t('fittings.yourCharacters.missing'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => {
        if (row.state === 'unloaded') {
          return <span className="text-text-dim">{t('fittings.yourCharacters.notLoaded')}</span>;
        }
        if (row.state === 'pending') {
          return <span className="text-text-dim">{t('common.loading')}</span>;
        }
        if (row.state === 'unconfirmed') {
          return (
            <HintText
              content={t('fittings.yourCharacters.unconfirmedHint')}
              className="text-warning"
            >
              {t('fittings.yourCharacters.unconfirmed')}
            </HintText>
          );
        }
        return row.gap.missingCount === 0 ? (
          <span className="text-success">{t('fittings.yourCharacters.canFly')}</span>
        ) : (
          t('fittings.yourCharacters.skills', { count: row.gap.missingCount })
        );
      },
      sortValue: gapRank((gap) => gap.missingCount),
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
      sortValue: gapRank((gap) => gap.totalSeconds),
    },
  ];

  const detail = (row: CharacterGapRow) => {
    if (row.state !== 'ready' || row.gap.skills.length === 0) {
      // DataTable has no per-row opt-out, so a row with nothing to list says why.
      const reason =
        row.state === 'unloaded'
          ? t('fittings.yourCharacters.notLoadedReason')
          : row.state === 'unconfirmed'
            ? t('fittings.yourCharacters.unconfirmedHint')
            : row.state === 'pending'
              ? t('common.loading')
              : t('fittings.yourCharacters.hasEverySkill');
      return <p className="py-1 text-xs text-text-dim">{reason}</p>;
    }
    return (
      <ul className="space-y-1 py-1 text-xs">
        {row.gap.skills.map((skill) => (
          <li key={skill.skillTypeID} className="flex justify-between gap-4">
            <span>
              {row.gap.names.get(skill.skillTypeID)} {romanLevel(skill.targetLevel)}
              {!skill.direct && (
                <span className="text-text-dim"> {t('fittings.yourCharacters.prerequisite')}</span>
              )}
            </span>
            <span className="tabular-nums text-text-dim">{formatCountdown(skill.seconds)}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="space-y-2">
      <SegmentedControl<Filter>
        label={t('fittings.yourCharacters.filter')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `${t('fittings.yourCharacters.all')} · ${rows.length}` },
          { value: 'fly', label: `${t('fittings.yourCharacters.canFly')} · ${flyCount}` },
          { value: 'cant', label: `${t('fittings.yourCharacters.cantFly')} · ${cantCount}` },
        ]}
      />
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
          expandableRow={{ leadingIcon: true, renderDetail: detail }}
        />
      )}
    </div>
  );
}
