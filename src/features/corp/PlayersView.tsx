import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  MenuGroup,
  MenuItem,
  RowActionsMenu,
  SegmentedControl,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { UnlinkConfirm } from './moons/UnlinkConfirm';
import { InlineError } from '@/components/ui/InlineError';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import { useOpenAfterMenu } from '@/components/ui/useOpenAfterMenu';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { CharacterLink } from '@/features/entities';
import { label } from '@/engine/corp/members';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useUrlSort } from '@/lib/useUrlState';
import { DialogShell } from './moons/BookDialogs';
import { callableErrorText } from './moons/feederErrorText';
import { CharacterMenuItems, CharacterRowMenu } from './corpRowMenus';
import {
  CORP_ROSTER_DEFAULT_COLUMNS,
  ROSTER_SORT,
  useVisibleCorpRosterColumns,
  type CorpRosterColumnId,
} from './corpRosterColumns';
import type { RosterRow } from './CorpRoster';
import { useRosterColumns } from './useRosterColumns';
import { buildPlayerLines, type CharacterChip, type PlayerLine } from './playerRows';
import type { RosterGrouping } from './useRosterGrouping';

type Line = PlayerLine<RosterRow>;

const CHIP_KEYS: Record<CharacterChip, { word: string; tip: string }> = {
  unsigned: {
    word: 'corp.members.players.unsignedChip',
    tip: 'corp.members.players.unsignedTip',
  },
  pending: { word: 'corp.members.players.pendingChip', tip: 'corp.members.players.pendingTip' },
  declined: { word: 'corp.members.players.declinedChip', tip: 'corp.members.players.declinedTip' },
  conflict: { word: 'corp.members.players.conflictChip', tip: 'corp.members.players.conflictTip' },
};

function Tag({ tip, children, warn }: { tip: string; children: ReactNode; warn?: boolean }) {
  return (
    <Tooltip content={tip}>
      <span tabIndex={0} className="inline-flex shrink-0 max-sm:hidden">
        <Pill tone={warn ? 'warning' : 'neutral'} outlined={warn}>
          {children}
        </Pill>
      </span>
    </Tooltip>
  );
}

const PASS_THROUGH_SORT = { sortValue: () => 0 } as const;
const firstDirection = (id: string): 'asc' | 'desc' =>
  id === 'lastSeen' || id === 'joined' ? 'desc' : 'asc';

const lineKey = (line: Line) => line.key;

export interface PlayersViewProps {
  rows: readonly RosterRow[];
  visibleRows: readonly RosterRow[];
  grouping: RosterGrouping;
  search: string;
  otherFilters: boolean;
  onGroupWith: (characterId: number) => void;
  onResetFilters: () => void;
  highlightId?: number | null;
  onHighlightSeen?: () => void;
}

export function PlayersView({
  rows,
  visibleRows,
  grouping,
  search,
  otherFilters,
  onGroupWith,
  onResetFilters,
  highlightId: pageHighlight = null,
  onHighlightSeen,
}: PlayersViewProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Line | null>(null);
  const [changingMain, setChangingMain] = useState<Line | null>(null);
  const urlHighlight = useHighlightParam();
  const [latchedHighlight] = useState(pageHighlight);
  useEffect(() => {
    if (pageHighlight !== null) onHighlightSeen?.();
  }, [pageHighlight, onHighlightSeen]);
  const highlightId = urlHighlight ?? latchedHighlight;
  const seeded = useRef(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const query = search.trim().toLowerCase();
  const filtering = query !== '' || otherFilters;
  const matchedIds = useMemo(() => new Set(visibleRows.map((r) => r.characterId)), [visibleRows]);
  const outsideMatches = useCallback(
    (name: string) => query !== '' && !otherFilters && name.toLowerCase().includes(query),
    [query, otherFilters]
  );
  const baseColumns = useRosterColumns();
  const sortProps = useUrlSort(
    'sort',
    ROSTER_SORT,
    baseColumns.map((c) => c.id)
  );
  const columnValue = useCallback(
    (id: string, row: RosterRow) => baseColumns.find((c) => c.id === id)?.sortValue?.(row),
    [baseColumns]
  );
  const { lines, highlightKey, highlightPlayerKey } = useMemo(
    () =>
      buildPlayerLines<RosterRow>({
        rows,
        groups: grouping.groups,
        names: grouping.names,
        matchedIds,
        outsideMatches,
        filtering,
        expanded: open,
        highlightId,
        conflictIds: grouping.conflictIds,
        declinedIds: grouping.declinedIds,
        sort: sortProps.sort,
        columnValue,
      }),
    [
      rows,
      grouping,
      matchedIds,
      outsideMatches,
      filtering,
      open,
      highlightId,
      sortProps.sort,
      columnValue,
    ]
  );

  useEffect(() => {
    if (seeded.current || highlightPlayerKey === null) return;
    seeded.current = true;
    setOpen((prev) => new Set(prev).add(highlightPlayerKey));
  }, [highlightPlayerKey]);

  const toggle = useCallback((line: Line) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(line.key)) next.add(line.key);
      return next;
    });
  }, []);

  const makeMain = useCallback(
    async (line: Line) => {
      if (!line.group || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        await grouping.source.edit({
          action: 'setMiner',
          minerId: line.group.id,
          characterIds: [...line.group.characterIds],
          mainCharacterId: line.characterId,
        });
      } catch (e) {
        setError(callableErrorText(t, e, 'corpTaxBook.moons.dialogs.failed'));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [grouping.source, t]
  );
  const editAndClear = useCallback(
    async (action: Parameters<RosterGrouping['source']['edit']>[0]) => {
      await grouping.source.edit(action);
      setError(null);
    },
    [grouping.source]
  );
  const conflictedName = useCallback(
    (line: Line): string | null => {
      const id = line.group?.characterIds.find((c) => grouping.conflictIds.has(c));
      return id === undefined ? null : grouping.source.name(id);
    },
    [grouping.conflictIds, grouping.source]
  );

  const { isVisible } = useColumnVisibility(
    useVisibleCorpRosterColumns,
    CORP_ROSTER_DEFAULT_COLUMNS
  );
  const columns = useMemo<DataTableColumn<Line>[]>(() => {
    const noData = <span className="text-text-dim">{t('corp.members.players.noData')}</span>;
    const member: DataTableColumn<Line> = {
      id: 'member',
      header: t('corp.members.columnMember'),
      stickyStart: true,
      stickyStartOnPanel: true,
      className: 'whitespace-nowrap',
      ...PASS_THROUGH_SORT,
      sortFirst: 'asc',
      render: (line) => <MemberCell line={line} />,
    };
    const wrapped = baseColumns
      .filter((c) => c.id !== 'member' && isVisible(c.id as CorpRosterColumnId))
      .map<DataTableColumn<Line>>((c) => {
        const source = (line: Line) =>
          c.id === 'lastSeen' && line.kind === 'player' ? line.seen : line.member;
        return {
          ...c,
          ...PASS_THROUGH_SORT,
          sortFirst: c.sortFirst ?? firstDirection(c.id),
          cellClassName: (line) => {
            const row = source(line);
            return row ? c.cellClassName?.(row) : undefined;
          },
          render: (line) => {
            const row = source(line);
            if (!row) return noData;
            if (c.id === 'ship' && line.kind === 'player')
              return label(row.shipName, row.shipTypeId);
            const cell = c.render(row);
            if (c.id !== 'lastSeen' || line.kind !== 'player') return cell;
            return (
              <Tooltip content={t('corp.members.players.latestTip')}>
                <span tabIndex={0}>{cell}</span>
              </Tooltip>
            );
          },
        };
      });
    return [member, ...wrapped];
  }, [baseColumns, isVisible, t]);

  const rowMenu = useCallback(
    (line: Line, tr: ReactElement) =>
      line.kind === 'loose' && line.member ? (
        <CharacterRowMenu
          characterId={line.characterId}
          name={line.name}
          extraItems={
            <MenuItem onSelect={() => onGroupWith(line.characterId)}>
              {t('corpTaxBook.moons.grouping.menu')}
            </MenuItem>
          }
        >
          {tr}
        </CharacterRowMenu>
      ) : (
        <PlayerLineMenu
          line={line}
          onAdd={(l) => onGroupWith(l.characterId)}
          conflictedName={conflictedName(line)}
          busy={busy}
          onChangeMain={setChangingMain}
          onMakeMain={(l) => void makeMain(l)}
          onRemove={setRemoving}
        >
          {tr}
        </PlayerLineMenu>
      ),
    [onGroupWith, makeMain, conflictedName, busy, t]
  );

  if (rows.length === 0) {
    return <EmptyState title={t('corp.members.empty')} />;
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        title={t('corp.members.noFilterMatches')}
        hint={t('corp.members.noFilterMatchesHint')}
        className="py-8"
        action={
          <Button size="sm" onClick={onResetFilters}>
            {t('common.resetFilters')}
          </Button>
        }
      />
    );
  }

  return (
    <>
      {error && (
        <div className="px-3 pb-2">
          <InlineError>{error}</InlineError>
        </div>
      )}
      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          rows={lines}
          rowKey={lineKey}
          responsive="table"
          density="compact"
          label={t('corp.members.players.tableLabel')}
          virtualize="auto"
          highlightRowKey={highlightKey}
          onRowClick={toggle}
          rowClickable={(line) => line.kind === 'player' && !filtering}
          rowClassName={(line) => (line.kind === 'alt' ? 'bg-panel-2/40' : undefined)}
          rowContextMenu={rowMenu}
          rowMoreActions
          {...sortProps}
        />
      </div>
      {removing?.group && (
        <UnlinkConfirm
          title={t('corp.members.players.removeTitle', {
            name: removing.name,
            main: grouping.source.name(removing.group.mainCharacterId),
          })}
          body={t('corp.members.players.removeBody', { name: removing.name })}
          actionLabel={t('corp.members.players.removeAction')}
          failedLabel={t('corp.members.players.removeFailed')}
          onClose={() => setRemoving(null)}
          onUnlink={async (leftOn) => {
            await editAndClear({
              action: 'unlink',
              minerId: removing.group!.id,
              characterId: removing.characterId,
              leftOn,
            });
          }}
        />
      )}
      {changingMain && (
        <ChangeMainDialog
          line={changingMain}
          rows={rows}
          grouping={grouping}
          edit={editAndClear}
          onClose={() => setChangingMain(null)}
        />
      )}
    </>
  );
}

function MemberCell({ line }: { line: Line }) {
  const { t } = useTranslation();
  if (line.kind === 'player') {
    const Caret = line.expanded ? Icon.Expanded : Icon.Descend;
    return (
      <span className="flex min-w-0 items-center gap-1 sm:gap-1.5">
        <Caret aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-dim" />
        <span className="sr-only">
          {line.expanded ? t('corp.members.players.collapse') : t('corp.members.players.expand')}
        </span>
        <span className={entityLinkClassName('min-w-0 truncate font-medium')}>{line.name}</span>
        <Pill tone="accent" className="shrink-0 max-sm:hidden">
          {t('corp.members.players.main')}
        </Pill>
        <span className="shrink-0 text-xs text-text-dim max-sm:hidden">
          {t('corp.members.players.characters', { count: line.characterCount })}
          {line.outsideCount > 0 &&
            ` · ${t('corp.members.players.outsideCount', { count: line.outsideCount })}`}
        </span>
        {line.unsignedCount > 0 && (
          <span className="shrink-0 text-xs text-text-dim max-sm:hidden">
            · {t('corp.members.players.unsignedCount', { count: line.unsignedCount })}
          </span>
        )}
      </span>
    );
  }
  const row = line.member;
  const flags = [
    ...(line.outside ? [t('corp.members.players.outsideChip')] : []),
    ...line.chips.map((chip) => t(CHIP_KEYS[chip].word)),
  ];
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 ${line.kind === 'alt' ? 'pl-2 sm:pl-7' : ''}`}
    >
      {line.kind === 'loose' && <span aria-hidden="true" className="inline-block w-3.5 shrink-0" />}
      {line.outside ? (
        <span className="min-w-0 truncate text-text-dim">{line.name}</span>
      ) : (
        <CharacterLink id={line.characterId} className="min-w-0 truncate">
          {line.name}
        </CharacterLink>
      )}
      {row?.isSelf && (
        <span className="shrink-0 rounded-xs bg-panel-2 px-1 py-0.5 text-[0.6875rem] text-text-dim max-sm:hidden">
          {t('corp.members.you')}
        </span>
      )}
      {row?.isCeo && <Pill className="shrink-0 max-sm:hidden">{t('corp.members.ceo')}</Pill>}
      {line.outside && (
        <Tag tip={t('corp.members.players.outsideTip')}>
          {t('corp.members.players.outsideChip')}
        </Tag>
      )}
      {line.chips.map((chip) => (
        <Tag key={chip} tip={t(CHIP_KEYS[chip].tip)} warn={chip === 'conflict'}>
          {t(CHIP_KEYS[chip].word)}
        </Tag>
      ))}
      {flags.length > 0 && (
        <span
          role="img"
          aria-label={flags.join(', ')}
          className="size-1.5 shrink-0 rounded-full bg-warning sm:hidden"
        />
      )}
    </span>
  );
}

function PlayerLineMenu({
  line,
  onAdd,
  conflictedName,
  busy,
  onChangeMain,
  onMakeMain,
  onRemove,
  children,
}: {
  line: Line;
  conflictedName: string | null;
  busy: boolean;
  onAdd: (line: Line) => void;
  onChangeMain: (line: Line) => void;
  onMakeMain: (line: Line) => void;
  onRemove: (line: Line) => void;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const isPlayer = line.kind === 'player';
  const blocked = line.outside && line.groupHasMember;
  const conflicted = conflictedName !== null;
  const inert = (label: string, reason: string) => (
    <MenuItem
      aria-disabled
      onSelect={(event) => event.preventDefault()}
      className="cursor-default aria-disabled:opacity-100"
    >
      <span className="flex flex-col">
        <span className="text-text-dim">{label}</span>
        <span className="text-xs text-text-dim">{reason}</span>
      </span>
    </MenuItem>
  );
  const conflictReason = t('corp.members.players.mainConflict', { name: conflictedName });
  const items = (
    <>
      <MenuGroup id="primary">
        {isPlayer ? (
          <>
            <MenuItem onSelect={() => run(() => onAdd(line))}>
              {t('corp.members.players.addCharacter')}
            </MenuItem>
            {conflicted ? (
              inert(t('corp.members.players.changeMain'), conflictReason)
            ) : (
              <MenuItem onSelect={() => run(() => onChangeMain(line))}>
                {t('corp.members.players.changeMain')}
              </MenuItem>
            )}
          </>
        ) : conflicted ? (
          inert(t('corpTaxBook.moons.grouping.makeMain'), conflictReason)
        ) : blocked ? (
          inert(t('corpTaxBook.moons.grouping.makeMain'), t('corp.members.players.makeMainOutside'))
        ) : (
          <MenuItem
            aria-disabled={busy || undefined}
            onSelect={(event) => {
              if (busy) event.preventDefault();
              else onMakeMain(line);
            }}
          >
            {t('corpTaxBook.moons.grouping.makeMain')}
          </MenuItem>
        )}
      </MenuGroup>
      <MenuGroup id="other">
        <CharacterMenuItems characterId={line.characterId} name={line.name} />
        {!isPlayer && (
          <MenuItem className="text-danger" onSelect={() => run(() => onRemove(line))}>
            {t('corp.members.players.remove')}
          </MenuItem>
        )}
      </MenuGroup>
    </>
  );
  return (
    <RowActionsMenu
      name={line.name}
      linksKeepBrowserMenu
      onCloseAutoFocus={onCloseAutoFocus}
      items={items}
    >
      {children}
    </RowActionsMenu>
  );
}

function ChangeMainDialog({
  line,
  rows,
  grouping,
  edit,
  onClose,
}: {
  line: Line;
  rows: readonly RosterRow[];
  grouping: RosterGrouping;
  edit: (action: Parameters<RosterGrouping['source']['edit']>[0]) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const group = line.group;
  const current = group
    ? group.characterIds.includes(group.mainCharacterId)
      ? group.mainCharacterId
      : group.characterIds[0]
    : line.characterId;
  const [main, setMain] = useState(String(current));
  if (!group) return null;
  const inCorp = new Set(rows.map((r) => r.characterId));
  const eligible = group.characterIds.filter((id) => !line.groupHasMember || inCorp.has(id));
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t('corp.members.players.changeMainTitle', { name: line.name })}
      confirmLabel={t('corp.members.players.changeMainConfirm')}
      canConfirm={Number(main) !== current}
      run={async () => {
        await edit({
          action: 'setMiner',
          minerId: group.id,
          characterIds: [...group.characterIds],
          mainCharacterId: Number(main),
        });
      }}
    >
      <p className="text-text-dim">{t('corp.members.players.changeMainIntro')}</p>
      <SegmentedControl
        label={t('corpTaxBook.moons.grouping.mailMain')}
        value={main}
        onChange={setMain}
        options={eligible.map((id) => ({ value: String(id), label: grouping.source.name(id) }))}
        uppercase={false}
      />
    </DialogShell>
  );
}
