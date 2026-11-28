import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CharacterAvatar,
  DataTable,
  DateRangeFields,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  SearchInput,
  SeverityIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SkillBar,
  textActionClassName,
  type DataTableColumn,
  type DataTableSort,
  Spinner,
} from '@/components/ui';
import type { ActiveFilter } from '@/components/ui/activeFilters';
import type { VettingFlag, VettingRawSource } from '@/engine/vetting';
import { cx } from '@/lib/cx';
import { formatTenure } from '@/lib/duration';
import { formatCount } from '@/lib/formatCount';
import { signedIsk } from '@/lib/signedIsk';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly, formatTimestamp } from '@/lib/timestamp';
import { SkillLink } from '@/features/entities';
import { VettingEntity } from './VettingEntity';
import type { RawRows } from './useVettingRawRows';
import type { SkillNames } from './useSkillNames';
import {
  NO_RAW_FILTERS,
  RAW_DATED,
  filterRawItems,
  prepareRawItems,
  rawKindOptions,
  tenureSeconds,
  validTime,
  type RawFilters,
  type RawItem,
} from './rawRowsView';
import { evidenceWhatKey } from './vettingView';
import { TableScroll } from '@/components/ui/TableScroll';

const ALL = '__all';

const DEFAULT_SORT: Record<VettingRawSource, DataTableSort> = {
  wallet: { columnId: 'at', direction: 'desc' },
  contact: { columnId: 'standing', direction: 'asc' },
  mail: { columnId: 'at', direction: 'desc' },
  contract: { columnId: 'at', direction: 'desc' },
  skills: { columnId: 'level', direction: 'desc' },
  history: { columnId: 'joined', direction: 'desc' },
};

interface TableProps {
  source: VettingRawSource;
  characterId: number | null;
  characters: readonly { characterId: number; name: string }[];
  readAt: number;
  flags: readonly VettingFlag[];
  data: RawRows;
  total: number;
  skills: SkillNames;
  reportPath: string;
  initial?: Partial<RawFilters>;
}

const firstName = (name: string) => name.split(' ')[0] ?? name;

export function VettingRawTable({
  source,
  characterId,
  characters,
  readAt,
  flags,
  data,
  total,
  skills,
  reportPath,
  initial,
}: TableProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const stamp = (iso: string) => {
    const ms = validTime(iso);
    return ms === null ? iso : formatTimestamp(new Date(ms), timeZone);
  };
  const day = (iso: string) => {
    const ms = validTime(iso);
    return ms === null ? iso : formatDateOnly(new Date(ms), timeZone);
  };
  const [filters, setFilters] = useState<RawFilters>({ ...NO_RAW_FILTERS, ...initial });
  const names = useMemo(
    () => new Map(characters.map((c) => [c.characterId, c.name])),
    [characters]
  );

  const whatLabel = (what: string) => {
    const key = evidenceWhatKey(what);
    if (key !== 'vetting.what.other') return t(key);
    const spaced = what.replaceAll('_', ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };
  const kindLabel = (kind: string) => {
    switch (source) {
      case 'mail':
        return t(`vetting.data.direction.${kind}`, { defaultValue: kind });
      case 'contact':
        return t(`vetting.data.standing.${kind}`, { defaultValue: kind });
      case 'skills':
        return kind;
      default:
        return whatLabel(kind);
    }
  };

  const every = useMemo(
    () =>
      prepareRawItems(source, data.rows, {
        parties: data.parties,
        flags,
        skills,
        whatLabel,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, data.rows, data.parties, flags, skills, t]
  );
  const scope = useMemo(
    () =>
      characterId === null ? every : every.filter((item) => item.row.characterId === characterId),
    [every, characterId]
  );
  const rows = useMemo(() => filterRawItems(scope, filters), [scope, filters]);
  const kinds = useMemo(() => rawKindOptions(scope), [scope]);
  const dated = RAW_DATED[source];
  const kindHeader = source === 'history' ? '' : t(`vetting.data.kind.${source}`);

  const columns = useMemo<DataTableColumn<RawItem>[]>(() => {
    const when = (header: string): DataTableColumn<RawItem> => ({
      id: 'at',
      header,
      primary: true,
      stickyStart: true,
      stickyStartOnPanel: true,
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      width: '20ch',
      sortValue: (item) =>
        item.row.at === null ? undefined : (validTime(item.row.at) ?? undefined),
      render: (item) => (item.row.at === null ? '-' : stamp(item.row.at)),
    });
    const withParty = (header: string): DataTableColumn<RawItem> => ({
      id: 'party',
      header,
      sortValue: (item) => data.parties.get(item.row.partyId ?? -1)?.name,
      render: (item) => {
        const who = item.row.partyId === undefined ? undefined : data.parties.get(item.row.partyId);
        if (item.row.partyId === undefined) return <span className="text-text-faint">-</span>;
        if (!who) {
          return (
            <span className="text-text-dim">
              {t('vetting.report.unknownParty', { id: item.row.partyId })}
            </span>
          );
        }
        return (
          <VettingEntity id={who.id} category={who.category}>
            {who.name}
          </VettingEntity>
        );
      },
    });
    const money = (header: string): DataTableColumn<RawItem> => ({
      id: 'amount',
      header,
      align: 'right',
      width: '20ch',
      className: 'whitespace-nowrap tabular-nums',
      cellClassName: (item) =>
        item.row.amount !== undefined && item.row.amount < 0 ? 'text-isk-neg' : undefined,
      sortValue: (item) => item.row.amount,
      render: (item) =>
        item.row.amount === undefined
          ? '-'
          : t('vetting.report.isk', { amount: signedIsk(item.row.amount, 0) }),
    });
    const kind = (width: string): DataTableColumn<RawItem> => ({
      id: 'kind',
      header: kindHeader,
      width,
      sortValue: (item) => kindLabel(item.kind),
      render: (item) => kindLabel(item.kind),
    });
    const corporationName = (id: number | undefined) =>
      id === undefined ? undefined : data.parties.get(id);
    const base: Record<VettingRawSource, DataTableColumn<RawItem>[]> = {
      wallet: [
        when(t('vetting.data.columns.when')),
        kind('20ch'),
        withParty(t('vetting.data.columns.with')),
        money(t('vetting.data.columns.amount')),
      ],
      contact: [
        {
          ...withParty(t('vetting.data.columns.contact')),
          primary: true,
          stickyStart: true,
          stickyStartOnPanel: true,
        },
        {
          id: 'kind',
          header: t('vetting.data.columns.kind'),
          width: '16ch',
          sortValue: (item) => item.row.what,
          render: (item) =>
            t(`vetting.data.contactKind.${item.row.what}`, { defaultValue: item.row.what }),
        },
        {
          id: 'standing',
          header: t('vetting.data.kind.contact'),
          align: 'right',
          width: '14ch',
          className: 'tabular-nums',
          cellClassName: (item) =>
            item.row.standing !== undefined && item.row.standing < 0 ? 'text-isk-neg' : undefined,
          sortValue: (item) => item.row.standing,
          sortFirst: 'asc',
          render: (item) =>
            item.row.standing === undefined
              ? '-'
              : item.row.standing > 0
                ? `+${item.row.standing}`
                : item.row.standing,
        },
      ],
      mail: [
        when(t('vetting.data.columns.sent')),
        kind('13ch'),
        { ...withParty(t('vetting.data.columns.senderOrRecipient')), width: '24ch' },
        {
          id: 'recipients',
          header: t('vetting.data.columns.recipients'),
          minWidth: '30ch',
          render: (item) => (
            <span className="text-text-dim">
              {(item.row.recipients ?? [])
                .map((id) => data.parties.get(id)?.name ?? t('vetting.report.unknownParty', { id }))
                .join(', ')}
            </span>
          ),
        },
      ],
      contract: [
        when(t('vetting.data.columns.issued')),
        kind('20ch'),
        withParty(t('vetting.data.columns.with')),
        money(t('vetting.data.columns.price')),
        {
          id: 'status',
          header: t('vetting.data.columns.status'),
          width: '16ch',
          sortValue: (item) => item.row.status,
          render: (item) => item.row.status ?? '-',
        },
      ],
      skills: [
        {
          id: 'skill',
          header: t('vetting.data.columns.skill'),
          primary: true,
          stickyStart: true,
          stickyStartOnPanel: true,
          minWidth: '28ch',
          sortValue: (item) =>
            skills.get(item.row.skillId ?? -1)?.name ?? String(item.row.skillId ?? ''),
          render: (item) => {
            const name = skills.get(item.row.skillId ?? -1)?.name;
            return name && item.row.skillId != null ? (
              <SkillLink typeId={item.row.skillId}>{name}</SkillLink>
            ) : (
              t('vetting.data.unknownSkill', { id: item.row.skillId })
            );
          },
        },
        {
          id: 'group',
          header: t('vetting.data.columns.group'),
          width: '24ch',
          sortValue: (item) => item.kind,
          render: (item) => item.kind || '-',
        },
        {
          id: 'level',
          header: t('vetting.data.columns.level'),
          width: '9ch',
          sortValue: (item) => item.row.level,
          render: (item) => <SkillBar level={item.row.level ?? 0} />,
        },
      ],
      history: [
        {
          id: 'corporation',
          header: t('vetting.data.columns.corporation'),
          primary: true,
          stickyStart: true,
          stickyStartOnPanel: true,
          minWidth: '28ch',
          sortValue: (item) => corporationName(item.row.corporationId)?.name,
          render: (item) => {
            const corporation = corporationName(item.row.corporationId);
            return corporation ? (
              <VettingEntity id={corporation.id} category="corporation">
                {corporation.name}
              </VettingEntity>
            ) : (
              t('vetting.report.unknownParty', { id: item.row.corporationId })
            );
          },
        },
        {
          id: 'joined',
          header: t('vetting.data.columns.joined'),
          width: '16ch',
          className: 'tabular-nums',
          sortValue: (item) => item.row.joined,
          render: (item) => (item.row.joined ? day(item.row.joined) : '-'),
        },
        {
          id: 'left',
          header: t('vetting.data.columns.left'),
          width: '16ch',
          className: 'tabular-nums',
          sortValue: (item) => item.row.left ?? '9999',
          render: (item) =>
            item.row.left ? (
              day(item.row.left)
            ) : (
              <span className="text-text-dim">{t('vetting.data.stillThere')}</span>
            ),
        },
        {
          id: 'tenure',
          header: t('vetting.data.columns.timeThere'),
          width: '14ch',
          className: 'tabular-nums',
          sortValue: (item) => tenureSeconds(item.row, readAt),
          render: (item) => formatTenure(tenureSeconds(item.row, readAt)),
        },
      ],
    };
    const columns = [...base[source]];
    if (characterId === null && characters.length > 1) {
      columns.push({
        id: 'character',
        header: t('vetting.data.columns.character'),
        width: '16ch',
        sortValue: (item) => names.get(item.row.characterId),
        render: (item) => (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <CharacterAvatar characterId={item.row.characterId} size="sm" loading="lazy" />
            {firstName(names.get(item.row.characterId) ?? '')}
          </span>
        ),
      });
    }
    if (source !== 'history') {
      columns.push({
        id: 'flag',
        header: t('vetting.data.columns.flag'),
        width: '24ch',
        sortValue: (item) => (item.flag ? t(`vetting.checks.${item.flag.check}.title`) : undefined),
        render: (item) =>
          item.flag ? (
            <Link
              to={`${reportPath}#flag-${item.flag.check}`}
              className={cx(textActionClassName(), 'inline-flex items-center gap-1.5')}
            >
              <SeverityIcon severity={item.flag.severity} />
              {t(`vetting.checks.${item.flag.check}.title`)}
            </Link>
          ) : (
            <span className="text-text-faint">-</span>
          ),
      });
    }
    return columns;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    source,
    characterId,
    characters.length,
    names,
    data.parties,
    skills,
    readAt,
    reportPath,
    timeZone,
    t,
  ]);

  const active: ActiveFilter<RawFilters>[] = [];
  if (filters.kind !== '') {
    active.push({
      label: kindHeader,
      value: kindLabel(filters.kind),
      clear: (value) => ({ ...value, kind: '' }),
    });
  }
  if (filters.from !== null || filters.to !== null) {
    active.push({
      label: t('vetting.data.dates'),
      value: t('vetting.data.datesRange', {
        from: filters.from ?? t('vetting.data.start'),
        to: filters.to ?? t('vetting.data.now'),
      }),
      clear: (value) => ({ ...value, from: null, to: null }),
    });
  }
  if (filters.flagged) {
    active.push({
      label: t('vetting.data.flaggedOnly'),
      clear: (value) => ({ ...value, flagged: false }),
    });
  }
  const filtered = active.length > 0 || filters.query.trim() !== '';
  const label = t(`vetting.data.source.${source}`);

  const kindSelect = (value: RawFilters, onChange: (next: RawFilters) => void) => (
    <Select
      value={value.kind === '' ? ALL : value.kind}
      onValueChange={(next) => onChange({ ...value, kind: next === ALL ? '' : next })}
    >
      <SelectTrigger aria-label={kindHeader} className="w-44" active={value.kind !== ''}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>
          {t('vetting.data.allKinds', { kind: kindHeader.toLowerCase() })}
        </SelectItem>
        {kinds.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {kindLabel(kind)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const dateRange = (value: RawFilters, onChange: (next: RawFilters) => void) => (
    <DateRangeFields
      from={value.from}
      to={value.to}
      onFromChange={(from) => onChange({ ...value, from })}
      onToChange={(to) => onChange({ ...value, to })}
      fromLabel={t('vetting.data.from')}
      toLabel={t('vetting.data.to')}
    />
  );

  const short = !data.loading && !data.failed && data.rows.length < total;
  const waiting = data.loading && scope.length === 0;
  const empty = !data.loading && !data.failed && !short && scope.length === 0;
  let body;
  if (waiting) {
    body = <Spinner size="sm" showLabel className="p-3 text-sm" />;
  } else if (empty || scope.length === 0) {
    body = !empty ? null : (
      <EmptyState
        title={t('vetting.data.emptyTitle', { source: label.toLowerCase() })}
        hint={t(RAW_DATED[source] ? 'vetting.data.emptyHintWindow' : 'vetting.data.emptyHint', {
          who:
            characterId === null
              ? t('vetting.data.theseCharacters')
              : firstName(names.get(characterId) ?? ''),
        })}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        title={t('vetting.data.noMatchTitle')}
        hint={t('vetting.data.noMatchHint', {
          count: scope.length,
          shown: formatCount(scope.length),
        })}
        action={
          <Button size="sm" onClick={() => setFilters(NO_RAW_FILTERS)}>
            {t('common.resetFilters')}
          </Button>
        }
      />
    );
  } else {
    body = (
      <TableScroll>
        <DataTable
          label={label}
          columns={columns}
          rows={rows}
          rowKey={(item) => item.key}
          defaultSort={DEFAULT_SORT[source]}
          density="compact"
          responsive="table"
          virtualize="auto"
          rowClassName={(item) => (item.flag ? 'bg-warning/10' : undefined)}
        />
      </TableScroll>
    );
  }

  return (
    <div className="space-y-3">
      {scope.length > 0 && (
        <FilterBar<RawFilters>
          value={filters}
          onChange={setFilters}
          active={active}
          resultCount={rows.length}
          search={
            <SearchInput
              aria-label={t('vetting.data.search', { source: label })}
              placeholder={t(
                source === 'skills' ? 'vetting.data.searchSkills' : 'vetting.data.searchPlaceholder'
              )}
              className="w-80 max-w-full"
              value={filters.query}
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            />
          }
          inline={(value, onChange) => (
            <>
              {kinds.length > 0 && kindSelect(value, onChange)}
              {dated && dateRange(value, onChange)}
            </>
          )}
        >
          {(value, onChange, surface) => (
            <>
              {surface === 'sheet' && kinds.length > 0 && (
                <FilterField label={kindHeader}>{kindSelect(value, onChange)}</FilterField>
              )}
              {surface === 'sheet' && dated && (
                <FilterField label={t('vetting.data.dates')}>
                  {dateRange(value, onChange)}
                </FilterField>
              )}
              {source !== 'history' && (
                <FilterField label={t('vetting.data.flaggedOnly')} hideCaption stretch={false}>
                  <FilterChip
                    label={t('vetting.data.flaggedOnly')}
                    selected={value.flagged}
                    onToggle={() => onChange({ ...value, flagged: !value.flagged })}
                  />
                </FilterField>
              )}
            </>
          )}
        </FilterBar>
      )}
      <p className="text-xs text-text-dim" aria-live="polite">
        {short
          ? t('vetting.data.missingRows', {
              count: total - data.rows.length,
              missing: formatCount(total - data.rows.length),
              total: formatCount(total),
            })
          : data.loading
            ? t('vetting.data.loadingMore', {
                loaded: formatCount(data.rows.length),
                total: formatCount(total),
              })
            : scope.length === 0
              ? ''
              : filtered
                ? t('vetting.data.ofRows', {
                    shown: formatCount(rows.length),
                    total: formatCount(scope.length),
                  })
                : t('vetting.data.allRows', {
                    count: scope.length,
                    total: formatCount(scope.length),
                  })}
      </p>
      {data.failed && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-danger"
        >
          <span>
            {t('vetting.data.loadFailed', {
              loaded: formatCount(data.rows.length),
              total: formatCount(total),
            })}
          </span>
          <Button onClick={data.retry}>{t('common.retry')}</Button>
        </div>
      )}
      {body}
    </div>
  );
}
