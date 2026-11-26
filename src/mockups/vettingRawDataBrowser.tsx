import { formatTenure } from '@/lib/duration';
import { useMemo, useState } from 'react';
import {
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  DateRangeFields,
  Panel,
  SearchInput,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SkillBar,
  TabPanel,
  CharacterAvatar,
  SeverityIcon,
  Tabs,
  textActionClassName,
  useTabsId,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import type { ActiveFilter } from '@/components/ui/activeFilters';
import { isoDay } from '@/features/miningTax/corpBook/memberFlag';
import { VettingEntity } from '@/features/corp/vetting/VettingEntity';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { signedIsk } from '@/lib/signedIsk';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import { NewComponent } from './NewComponent';
import {
  PILOT_BY_ID,
  PILOTS,
  ROWS,
  SOURCE_IDS,
  SOURCE_LABEL,
  SOURCE_TYPES,
  rowsOf,
  READ_AT,
  type RawRow,
  type SourceId,
} from './vettingRawDataFixtures';

const stay = (e: { preventDefault: () => void }) => e.preventDefault();

export interface BrowserFilters {
  query: string;
  type: string;
  from: string | null;
  to: string | null;
  flagged: boolean;
}

const NO_FILTERS: BrowserFilters = {
  query: '',
  type: '',
  from: null,
  to: null,
  flagged: false,
};

const HAS_DATES: Record<SourceId, boolean> = {
  wallet: true,
  contact: false,
  mail: true,
  contract: true,
  skills: false,
  history: true,
};

const TYPE_LABEL: Record<SourceId, string> = {
  wallet: 'Type',
  contact: 'Standing',
  mail: 'Direction',
  contract: 'Contract type',
  skills: 'Skill group',
  history: '',
};

const STANDINGS = ['Hostile', 'Neutral', 'Friendly'];
const bucket = (standing: number | undefined) =>
  standing === undefined ? '' : standing < 0 ? 'Hostile' : standing === 0 ? 'Neutral' : 'Friendly';

function typeOptions(source: SourceId): string[] {
  return source === 'contact' ? STANDINGS : SOURCE_TYPES[source];
}

function typeOf(source: SourceId, row: RawRow): string {
  switch (source) {
    case 'wallet':
    case 'contract':
      return row.what;
    case 'mail':
      return row.direction ?? '';
    case 'contact':
      return bucket(row.standing);
    case 'skills':
      return row.group ?? '';
    default:
      return '';
  }
}

function applyFilters(source: SourceId, rows: RawRow[], f: BrowserFilters): RawRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (f.flagged && !row.flag) return false;
    if (f.type !== '' && typeOf(source, row) !== f.type) return false;
    if (row.at !== null) {
      const day = isoDay(row.at);
      if (f.from !== null && day < f.from) return false;
      if (f.to !== null && day > f.to) return false;
    }
    if (q === '') return true;
    const hay = [
      row.what,
      row.party?.name,
      row.party?.corporation,
      row.recipients?.join(' '),
      row.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

const isk = (value: number) => `${signedIsk(value, 0)} ISK`;
const first = (name: string) => name.split(' ')[0];

function useColumns(source: SourceId, allCharacters: boolean): DataTableColumn<RawRow>[] {
  const timeZone = useTimeZone();
  const when = (header: string): DataTableColumn<RawRow> => ({
    id: 'at',
    header,
    primary: true,
    stickyStart: true,
    stickyStartOnPanel: true,
    className: 'whitespace-nowrap tabular-nums text-text-dim',
    width: '20ch',
    sortValue: (row) => (row.at === null ? undefined : Date.parse(row.at)),
    render: (row) => (row.at === null ? '-' : formatTimestamp(new Date(row.at), timeZone)),
  });
  const withParty = (header: string): DataTableColumn<RawRow> => ({
    id: 'party',
    header,
    minWidth: '26ch',
    sortValue: (row) => row.party?.name,
    render: (row) =>
      row.party ? (
        <span className="min-w-0">
          <VettingEntity id={row.party.id} category={row.party.category}>
            {row.party.name}
          </VettingEntity>
          {row.party.corporation && (
            <span className="block truncate text-xs text-text-dim">{row.party.corporation}</span>
          )}
        </span>
      ) : (
        <span className="text-text-faint">-</span>
      ),
  });
  const character: DataTableColumn<RawRow> = {
    id: 'character',
    header: 'Character',
    width: '18ch',
    sortValue: (row) => PILOT_BY_ID.get(row.characterId)?.name,
    render: (row) => (
      <span className="flex items-center gap-2 whitespace-nowrap">
        <CharacterAvatar characterId={row.characterId} size="sm" loading="lazy" />
        {first(PILOT_BY_ID.get(row.characterId)?.name ?? '')}
      </span>
    ),
  };
  const flag: DataTableColumn<RawRow> = {
    id: 'flag',
    header: 'Flag',
    width: '24ch',
    sortValue: (row) => row.flag?.title,
    render: (row) =>
      row.flag ? (
        <span
          data-new-component="NewFlagLink"
          className="inline-flex rounded-xs border border-dashed border-warning px-1.5 py-0.5"
        >
          <NewFlagLink id={row.flag.id} title={row.flag.title} />
        </span>
      ) : (
        <span className="text-text-faint">-</span>
      ),
  };
  const money = (header: string): DataTableColumn<RawRow> => ({
    id: 'amount',
    header,
    align: 'right',
    width: '22ch',
    className: 'whitespace-nowrap tabular-nums',
    cellClassName: (row) =>
      row.amount !== undefined && row.amount < 0 ? 'text-isk-neg' : undefined,
    sortValue: (row) => row.amount,
    render: (row) => (row.amount === undefined ? '-' : isk(row.amount)),
  });
  const base: Record<SourceId, DataTableColumn<RawRow>[]> = {
    wallet: [
      when('When'),
      {
        id: 'what',
        header: 'Type',
        width: '20ch',
        sortValue: (row) => row.what,
        render: (row) => row.what,
      },
      withParty('With'),
      money('Amount'),
    ],
    contact: [
      { ...withParty('Contact'), primary: true, stickyStart: true, stickyStartOnPanel: true },
      {
        id: 'kind',
        header: 'Kind',
        width: '16ch',
        sortValue: (row) => row.party?.category,
        render: (row) => <span className="capitalize">{row.party?.category}</span>,
      },
      {
        id: 'standing',
        header: 'Standing',
        align: 'right',
        width: '14ch',
        className: 'tabular-nums',
        cellClassName: (row) =>
          row.standing !== undefined && row.standing < 0 ? 'text-isk-neg' : undefined,
        sortValue: (row) => row.standing,
        sortFirst: 'asc',
        render: (row) => (row.standing! > 0 ? `+${row.standing}` : row.standing),
      },
    ],
    mail: [
      when('Sent'),
      {
        id: 'direction',
        header: 'Direction',
        width: '14ch',
        sortValue: (row) => row.direction,
        render: (row) => row.direction,
      },
      withParty('Sender or recipient'),
      {
        id: 'recipients',
        header: 'All recipients',
        minWidth: '30ch',
        render: (row) => <span className="text-text-dim">{row.recipients?.join(', ')}</span>,
      },
    ],
    contract: [
      when('Issued'),
      {
        id: 'what',
        header: 'Type',
        width: '16ch',
        sortValue: (row) => row.what,
        render: (row) => row.what,
      },
      withParty('With'),
      money('Price'),
      {
        id: 'status',
        header: 'Status',
        width: '16ch',
        sortValue: (row) => row.status,
        render: (row) => row.status,
      },
    ],
    skills: [
      {
        id: 'what',
        header: 'Skill',
        primary: true,
        stickyStart: true,
        stickyStartOnPanel: true,
        minWidth: '28ch',
        sortValue: (row) => row.what,
        render: (row) => row.what,
      },
      {
        id: 'group',
        header: 'Group',
        width: '24ch',
        sortValue: (row) => row.group,
        render: (row) => row.group,
      },
      {
        id: 'level',
        header: 'Level',
        width: '18ch',
        sortValue: (row) => row.level,
        render: (row) => <SkillBar level={row.level ?? 0} />,
      },
    ],
    history: [
      {
        id: 'what',
        header: 'Corporation',
        primary: true,
        stickyStart: true,
        stickyStartOnPanel: true,
        minWidth: '28ch',
        sortValue: (row) => row.what,
        render: (row) => row.what,
      },
      {
        id: 'joined',
        header: 'Joined',
        width: '16ch',
        className: 'tabular-nums',
        sortValue: (row) => row.joined,
        render: (row) => row.joined,
      },
      {
        id: 'left',
        header: 'Left',
        width: '16ch',
        className: 'tabular-nums',
        sortValue: (row) => row.left ?? '9999',
        render: (row) => row.left ?? <span className="text-text-dim">Still there</span>,
      },
      {
        id: 'tenure',
        header: 'Time there',
        width: '14ch',
        className: 'tabular-nums',
        sortValue: (row) => tenureSeconds(row),
        render: (row) => formatTenure(tenureSeconds(row)),
      },
    ],
  };
  const columns = [...base[source]];
  if (allCharacters) columns.push(character);
  if (source !== 'history') columns.push(flag);
  return columns;
}

function NewFlagLink({ id, title }: { id: string; title: string }) {
  return (
    <a
      href={`#flag-${id}`}
      className={cx(textActionClassName(), 'inline-flex items-center gap-1.5 whitespace-nowrap')}
    >
      <SeverityIcon severity={id === 'watchlistIsk' ? 'critical' : 'warning'} />
      {title}
    </a>
  );
}

function tenureSeconds(row: RawRow): number {
  const end = row.left ? Date.parse(row.left) : READ_AT;
  return (end - Date.parse(row.joined ?? '')) / 1000;
}

const DEFAULT_SORT: Record<SourceId, DataTableSort> = {
  wallet: { columnId: 'at', direction: 'desc' },
  contact: { columnId: 'standing', direction: 'asc' },
  mail: { columnId: 'at', direction: 'desc' },
  contract: { columnId: 'at', direction: 'desc' },
  skills: { columnId: 'level', direction: 'desc' },
  history: { columnId: 'joined', direction: 'desc' },
};

const ALL = '__all';

interface BrowserProps {
  source: SourceId;
  characterId?: number | null;
  initial?: Partial<BrowserFilters>;
  sort?: DataTableSort;
}

export function SourceBrowser({ source, characterId = null, initial, sort }: BrowserProps) {
  const who = characterId;
  const [filters, setFilters] = useState<BrowserFilters>({ ...NO_FILTERS, ...initial });
  const allCharacters = who === null;
  const columns = useColumns(source, allCharacters);
  const scope = useMemo(() => rowsOf(source, who), [source, who]);
  const rows = useMemo(() => applyFilters(source, scope, filters), [source, scope, filters]);
  const typeNames = typeOptions(source);
  const active: ActiveFilter<BrowserFilters>[] = [];
  if (filters.type !== '')
    active.push({
      label: TYPE_LABEL[source],
      value: filters.type,
      clear: (v) => ({ ...v, type: '' }),
    });
  if (filters.from !== null || filters.to !== null)
    active.push({
      label: 'Dates',
      value: `${filters.from ?? 'start'} to ${filters.to ?? 'now'}`,
      clear: (v) => ({ ...v, from: null, to: null }),
    });
  if (filters.flagged)
    active.push({ label: 'Flagged rows only', clear: (v) => ({ ...v, flagged: false }) });
  const nothingToFilter = scope.length === 0;
  const filtered = active.length > 0 || filters.query.trim() !== '';

  const body = (() => {
    if (scope.length === 0) {
      return (
        <EmptyState
          title={`No ${SOURCE_LABEL[source].toLowerCase()} rows`}
          hint={`The read found nothing here for ${
            who === null ? 'these characters' : first(PILOT_BY_ID.get(who)?.name ?? '')
          }${HAS_DATES[source] && source !== 'history' ? ' in the last 30 days' : ''}. Empty is a result: the source was read.`}
        />
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          title="No rows match"
          hint={`None of the ${formatCount(scope.length)} rows read fits these filters.`}
          action={<Button onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>}
        />
      );
    }
    return (
      <DataTable
        label={SOURCE_LABEL[source]}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        defaultSort={sort ?? DEFAULT_SORT[source]}
        density="compact"
        responsive="table"
        virtualize="auto"
        rowClassName={(row) => (row.flag ? 'bg-warning/10' : undefined)}
      />
    );
  })();

  return (
    <div className="space-y-3">
      {!nothingToFilter && (
        <>
          <FilterBar<BrowserFilters>
            value={filters}
            onChange={setFilters}
            active={active}
            resultCount={rows.length}
            search={
              <SearchInput
                aria-label={`Search ${SOURCE_LABEL[source]}`}
                placeholder={
                  source === 'skills' ? 'Search skills' : 'Search names, types, corporations'
                }
                className="w-80 max-w-full"
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              />
            }
            inline={(value, onChange) => (
              <>
                {typeNames.length > 0 && (
                  <TypeSelect
                    label={TYPE_LABEL[source]}
                    names={typeNames}
                    value={value.type}
                    onChange={(type) => onChange({ ...value, type })}
                  />
                )}
                {HAS_DATES[source] && (
                  <DateRangeFields
                    from={value.from}
                    to={value.to}
                    onFromChange={(from) => onChange({ ...value, from })}
                    onToChange={(to) => onChange({ ...value, to })}
                    fromLabel="From"
                    toLabel="To"
                  />
                )}
              </>
            )}
          >
            {(value, onChange, surface) => (
              <>
                {surface === 'sheet' && typeNames.length > 0 && (
                  <FilterField label={TYPE_LABEL[source]}>
                    <TypeSelect
                      label={TYPE_LABEL[source]}
                      names={typeNames}
                      value={value.type}
                      onChange={(type) => onChange({ ...value, type })}
                    />
                  </FilterField>
                )}
                {surface === 'sheet' && HAS_DATES[source] && (
                  <FilterField label="Dates">
                    <DateRangeFields
                      from={value.from}
                      to={value.to}
                      onFromChange={(from) => onChange({ ...value, from })}
                      onToChange={(to) => onChange({ ...value, to })}
                      fromLabel="From"
                      toLabel="To"
                    />
                  </FilterField>
                )}
                {source !== 'history' && (
                  <FilterField label="Flagged rows only" hideCaption stretch={false}>
                    <FilterChip
                      label="Flagged rows only"
                      selected={value.flagged}
                      onToggle={() => onChange({ ...value, flagged: !value.flagged })}
                    />
                  </FilterField>
                )}
              </>
            )}
          </FilterBar>
          <p className="text-xs text-text-dim" aria-live="polite">
            {filtered
              ? `${formatCount(rows.length)} of ${formatCount(scope.length)} rows`
              : `All ${formatCount(scope.length)} rows read. Scroll for the rest.`}
          </p>
        </>
      )}
      {body}
    </div>
  );
}

function TypeSelect({
  label,
  names,
  value,
  onChange,
}: {
  label: string;
  names: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value === '' ? ALL : value} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger aria-label={label} className="w-44" active={value !== ''}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}s</SelectItem>
        {names.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DataBrowserPage({
  source = 'wallet',
  characterId = null,
  initial,
  sort,
}: BrowserProps) {
  const tabsId = useTabsId();
  const [current, setCurrent] = useState<SourceId>(source);
  const [who, setWho] = useState<number | null>(characterId);
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <a href="#" onClick={stay} className={cx(textActionClassName(), 'inline-flex w-fit text-sm')}>
        <span aria-hidden="true">‹&nbsp;</span>Report: Tamsin Vell
      </a>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Data we read</h1>
        <p className="text-sm text-text-dim">
          Application · Tamsin Vell and 2 more · read 14 Nov 2026, 10:00. Every row the read
          returned, not only the ones a check flagged.
        </p>
      </div>
      <NewComponent name="RawDataBrowser">
        <Panel padded={false}>
          <div className="space-y-3 p-3">
            <Tabs
              tabsId={tabsId}
              label="Data sources"
              value={current}
              onChange={(id) => setCurrent(id as SourceId)}
              tabs={SOURCE_IDS.map((id) => ({
                id,
                label: SOURCE_LABEL[id],
                count: ROWS[id].length,
              }))}
            />
            <CharacterSwitch who={who} onChange={setWho} />
            <TabPanel tabsId={tabsId} tabId={current}>
              <SourceBrowser
                key={`${current}:${who}`}
                source={current}
                characterId={who}
                initial={current === source ? initial : undefined}
                sort={current === source ? sort : undefined}
              />
            </TabPanel>
          </div>
        </Panel>
      </NewComponent>
    </div>
  );
}

function CharacterSwitch({
  who,
  onChange,
}: {
  who: number | null;
  onChange: (id: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Character</span>
      <SegmentedControl
        label="Character"
        uppercase={false}
        value={who === null ? ALL : String(who)}
        onChange={(v) => onChange(v === ALL ? null : Number(v))}
        options={[
          { value: ALL, label: `All ${PILOTS.length}` },
          ...PILOTS.map((p) => ({ value: String(p.characterId), label: p.name })),
        ]}
      />
    </div>
  );
}
