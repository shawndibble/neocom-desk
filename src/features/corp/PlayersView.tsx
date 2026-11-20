/**
 * The Members page's Players view: each Player is a parent row that opens to its characters in
 * the same columns, and members in no group stay single rows. The row click on a Player expands
 * it; right-click, touch-and-hold and the ⋮ share one menu (DESIGN.md §6c). Officer-only: the
 * page offers the view only where it can edit a book.
 */
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InlineError } from '@/components/ui/InlineError';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import { useOpenAfterMenu } from '@/components/ui/useOpenAfterMenu';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { CharacterLink } from '@/features/entities';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useIsPhone } from '@/lib/useIsPhone';
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
import { useRosterColumns, type RosterRow } from './CorpRoster';
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

/** A static badge: the word shows, the tooltip explains (§6c). */
function Tag({ tip, children, warn }: { tip: string; children: ReactNode; warn?: boolean }) {
  return (
    <Tooltip content={tip}>
      <span tabIndex={0} className="inline-flex shrink-0">
        <Pill tone={warn ? 'warning' : 'neutral'} outlined={warn}>
          {children}
        </Pill>
      </span>
    </Tooltip>
  );
}

/**
 * The builder orders the rows (a sort must keep each Player's alts under it), so DataTable's own
 * sort must not move them: a constant `sortValue` makes a column sortable (header button, active
 * arrow, `?sort=`) while its stable sort leaves the builder's order alone.
 */
const PASS_THROUGH_SORT = { sortValue: () => 0 } as const;
/** A first click sorts text A-Z and dates / spans most recent first, as the Characters table does. */
const firstDirection = (id: string): 'asc' | 'desc' =>
  id === 'lastSeen' || id === 'joined' ? 'desc' : 'asc';

const lineKey = (line: Line) => line.key;

export interface PlayersViewProps {
  /** The whole roster. */
  rows: readonly RosterRow[];
  /** The rows that pass the search and every filter. */
  visibleRows: readonly RosterRow[];
  grouping: RosterGrouping;
  /** The search text (debounced) and whether the dark / ship / place filters are on. */
  search: string;
  otherFilters: boolean;
  /** Opens the page's group dialog for the Player holding this character (or the lone member). */
  onGroupWith: (characterId: number) => void;
  onResetFilters: () => void;
}

export function PlayersView({
  rows,
  visibleRows,
  grouping,
  search,
  otherFilters,
  onGroupWith,
  onResetFilters,
}: PlayersViewProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Line | null>(null);
  const [changingMain, setChangingMain] = useState<Line | null>(null);
  const highlightId = useHighlightParam();

  const query = search.trim().toLowerCase();
  const filtering = query !== '' || otherFilters;
  const matchedIds = useMemo(() => new Set(visibleRows.map((r) => r.characterId)), [visibleRows]);
  const outsideMatches = useCallback(
    (name: string) => query !== '' && !otherFilters && name.toLowerCase().includes(query),
    [query, otherFilters]
  );
  const baseColumns = useRosterColumns();
  // The same `?sort=` and column ids as the Characters table, so the two views behave alike.
  const sortProps = useUrlSort(
    'sort',
    ROSTER_SORT,
    baseColumns.map((c) => c.id)
  );
  const columnValue = useCallback(
    (id: string, row: RosterRow) => baseColumns.find((c) => c.id === id)?.sortValue?.(row),
    [baseColumns]
  );
  const { lines, highlightKey } = useMemo(
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

  const toggle = useCallback((line: Line) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(line.key)) next.add(line.key);
      return next;
    });
  }, []);

  const makeMain = useCallback(
    async (line: Line) => {
      if (!line.group) return;
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
      }
    },
    [grouping.source, t]
  );

  const phone = useIsPhone();
  const { isVisible } = useColumnVisibility(
    useVisibleCorpRosterColumns,
    CORP_ROSTER_DEFAULT_COLUMNS
  );
  const columns = useMemo<DataTableColumn<Line>[]>(() => {
    const noData = <span className="text-text-faint">{t('corp.members.players.noData')}</span>;
    const member: DataTableColumn<Line> = {
      id: 'member',
      header: t('corp.members.columnMember'),
      stickyStart: true,
      stickyStartOnPanel: true,
      className: 'whitespace-nowrap',
      ...PASS_THROUGH_SORT,
      sortFirst: 'asc',
      render: (line) => <MemberCell line={line} phone={phone} />,
    };
    const wrapped = baseColumns
      .filter((c) => c.id !== 'member' && isVisible(c.id as CorpRosterColumnId))
      .map<DataTableColumn<Line>>((c) => {
        // A Player's Last seen is its latest corp character's; every other cell is its main's.
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
  }, [baseColumns, isVisible, phone, t]);

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
          onChangeMain={setChangingMain}
          onMakeMain={(l) => void makeMain(l)}
          onRemove={setRemoving}
        >
          {tr}
        </PlayerLineMenu>
      ),
    [onGroupWith, makeMain, t]
  );

  if (rows.length === 0) {
    return <EmptyState title={t('corp.members.empty')} hint={t('corp.members.emptyHint')} />;
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
        <ConfirmDialog
          open
          title={t('corp.members.players.removeTitle', {
            name: removing.name,
            main: grouping.source.name(removing.group.mainCharacterId),
          })}
          body={t('corp.members.players.removeBody', { name: removing.name })}
          actionLabel={t('corp.members.players.removeAction')}
          cancelLabel={t('common.cancel')}
          failedLabel={t('corp.members.players.removeFailed')}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await grouping.source.edit({
              action: 'unlink',
              minerId: removing.group!.id,
              characterId: removing.characterId,
            });
          }}
        />
      )}
      {changingMain && (
        <ChangeMainDialog
          line={changingMain}
          rosterIds={rows}
          grouping={grouping}
          onClose={() => setChangingMain(null)}
        />
      )}
    </>
  );
}

/** The member cell: a Player's caret, main's name and counts; an alt's name and chips. */
function MemberCell({ line, phone }: { line: Line; phone: boolean }) {
  const { t } = useTranslation();
  if (line.kind === 'player') {
    const Caret = line.expanded ? Icon.Expanded : Icon.Descend;
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Caret aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-dim" />
        <span className="sr-only">
          {line.expanded ? t('corp.members.players.collapse') : t('corp.members.players.expand')}
        </span>
        {/* The row click is the expand, so the name is plain accent text, not a link (§6c restraint). */}
        <span className={entityLinkClassName('max-w-[12rem] truncate font-medium sm:max-w-none')}>
          {line.name}
        </span>
        <Pill tone="accent" className="shrink-0">
          {t('corp.members.players.main')}
        </Pill>
        <span className="shrink-0 text-xs text-text-dim">
          {phone
            ? t('corp.members.players.charactersShort', { count: line.characterCount })
            : t('corp.members.players.characters', { count: line.characterCount })}
          {!phone &&
            line.outsideCount > 0 &&
            ` · ${t('corp.members.players.outsideCount', { count: line.outsideCount })}`}
        </span>
        {!phone && line.unsignedCount > 0 && (
          <span className="shrink-0 text-xs text-text-faint">
            · {t('corp.members.players.unsignedCount', { count: line.unsignedCount })}
          </span>
        )}
      </span>
    );
  }
  const row = line.member;
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${line.kind === 'alt' ? 'pl-7' : ''}`}>
      {line.kind === 'loose' && <span aria-hidden="true" className="inline-block w-3.5 shrink-0" />}
      {line.outside ? (
        <span className="truncate text-text-dim">{line.name}</span>
      ) : (
        <CharacterLink id={line.characterId} className="truncate">
          {line.name}
        </CharacterLink>
      )}
      {row?.isSelf && (
        <span className="shrink-0 rounded-xs bg-panel-2 px-1 py-0.5 text-[0.6875rem] text-text-dim">
          {t('corp.members.you')}
        </span>
      )}
      {row?.isCeo && <Pill className="shrink-0">{t('corp.members.ceo')}</Pill>}
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
    </span>
  );
}

/**
 * A Player or alt row's menu. Groups fold by id (§6c); a dialog opens after the menu closes
 * (`useOpenAfterMenu`). A Player's: Add character…, Change main…. An alt's: Make main (inert
 * with its reason for an outside character while the group has a corp member) and the danger
 * Remove from Player.
 */
function PlayerLineMenu({
  line,
  onAdd,
  onChangeMain,
  onMakeMain,
  onRemove,
  children,
}: {
  line: Line;
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
  const items = (
    <>
      <MenuGroup id="primary">
        {isPlayer ? (
          <>
            <MenuItem onSelect={() => run(() => onAdd(line))}>
              {t('corp.members.players.addCharacter')}
            </MenuItem>
            <MenuItem onSelect={() => run(() => onChangeMain(line))}>
              {t('corp.members.players.changeMain')}
            </MenuItem>
          </>
        ) : blocked ? (
          <MenuItem
            aria-disabled
            onSelect={(event) => event.preventDefault()}
            className="cursor-default aria-disabled:opacity-100"
          >
            <span className="flex flex-col">
              <span className="text-text-dim">{t('corpTaxBook.moons.grouping.makeMain')}</span>
              <span className="text-xs text-text-dim">
                {t('corp.members.players.makeMainOutside')}
              </span>
            </span>
          </MenuItem>
        ) : (
          <MenuItem onSelect={() => onMakeMain(line)}>
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

/** Pick the character that gets the mail: a corp member while the Player has one. */
function ChangeMainDialog({
  line,
  rosterIds,
  grouping,
  onClose,
}: {
  line: Line;
  rosterIds: readonly RosterRow[];
  grouping: RosterGrouping;
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
  const inCorp = new Set(rosterIds.map((r) => r.characterId));
  const eligible = group.characterIds.filter((id) => !line.groupHasMember || inCorp.has(id));
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t('corp.members.players.changeMainTitle', { name: line.name })}
      confirmLabel={t('corp.members.players.changeMainConfirm')}
      canConfirm={Number(main) !== current}
      run={async () => {
        await grouping.source.edit({
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
