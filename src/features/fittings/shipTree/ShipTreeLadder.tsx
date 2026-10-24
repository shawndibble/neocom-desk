/**
 * The Ship Tree read top to bottom (phone default): one section per main-
 * and industry-line class, specialised classes nested and collapsible under
 * their parent. Carries the map's marks — lit/dim class icon, skill bars,
 * Ω, tech corners, tone, Mastery badge — at list size. A tap on a hull
 * opens the Ship Info window (the caller's).
 *
 * The toolbar: view switch, the tree's search over every faction (the map's),
 * and beside it the funnel holding the filters for picking what to train —
 * fly state and Mastery. The filter is the caller's (it lives in the URL and
 * also feeds the faction bar's counts), and the faction bar sits under the
 * toolbar because those filters change its counts.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  Caret,
  EmptyState,
  entityLinkClassName,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { romanLevel } from '@/engine/projection';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useIsPhone } from '@/lib/useIsPhone';
import type { ShipTreeShip } from '@/sde/types';
import { IsisThumb } from './IsisTile';
import { Legend } from './Legend';
import { MapSearch } from './MapSearch';
import { SkillBlocks } from './SkillBlocks';
import { classSkillTitle } from './classSkillTitle';
import { flyLabel } from './flyLabel';
import { classIconUrl, factionEmblemUrl } from './shipTreeAssets';
import {
  allSectionIds,
  factionNameOf,
  flyableCount,
  flyStateCounts,
  hullMatches,
  inGameFactionOrder,
  isShipTreeFiltered,
  ladderSections,
  sectionPath,
  MASTERY_TIERS,
  masteryCounts,
  masteryFilterActive,
  NO_SHIP_TREE_FILTER,
  type FlyState,
  type LadderSection,
  type ShipTreeFilter,
} from './shipTreeModel';
import type { FactionTree } from './useFactionTree';
import type { ShipTreeSource } from './useShipTreeData';

interface LadderProps {
  source: ShipTreeSource;
  tree: FactionTree;
  filter: ShipTreeFilter;
  onFilter: (next: ShipTreeFilter) => void;
  /** Hulls per faction that pass `filter`; absent when nothing is filtered. */
  factionMatches: ReadonlyMap<number, number> | undefined;
  /** The faction picker, placed under the toolbar. */
  factionBar: ReactNode;
  /** The hull whose Ship Info window is open: marked, and shown even if filtered out. */
  selectedTypeID: number | null;
  onFaction: (factionID: number) => void;
  onOpenShip: (ship: ShipTreeShip) => void;
  viewSwitch: ReactNode;
}

export function ShipTreeLadder({
  source,
  tree,
  filter,
  onFilter,
  factionMatches,
  factionBar,
  selectedTypeID,
  onFaction,
  onOpenShip,
  viewSwitch,
}: LadderProps) {
  const { t } = useTranslation();
  const { data, statuses } = source;
  const narrow = useIsNarrow();
  // The Ship Info window's own test for a bottom sheet rather than a side panel.
  const sheetWindow = useIsPhone();
  const filtered = isShipTreeFiltered(filter);

  const sections = useMemo(() => ladderSections(tree.defs), [tree.defs]);
  const sectionIds = useMemo(() => allSectionIds(sections), [sections]);
  const omegaChips = useMemo(
    () => new Set(tree.layout.omegas.map((o) => o.classId)),
    [tree.layout]
  );
  const factionShips = useMemo(
    () => data.ships.filter((s) => s.factionID === tree.factionID),
    [data, tree.factionID]
  );
  const flyCounts = flyStateCounts(factionShips, statuses);
  const tierCounts = masteryCounts(factionShips, statuses);

  // The reader's open sections, for this faction and filter. Each new pair
  // starts over: top level open, or every section while filtered so a match
  // in a sub-class can't hide — however the filter changed, Back included.
  const openKey = `${tree.factionID}|${filter.fly}|${[...filter.mastery].sort().join(',')}`;
  const startOpen = (): ReadonlySet<number> =>
    new Set(filtered ? sectionIds : sections.map((s) => s.def.id));
  const [openState, setOpenState] = useState(() => ({ key: openKey, ids: startOpen() }));
  // Reset during render (React's "adjust state on a prop change"), so going
  // back to an earlier filter starts open again rather than restoring it.
  if (openState.key !== openKey) setOpenState({ key: openKey, ids: startOpen() });
  const userOpen: ReadonlySet<number> = openState.key === openKey ? openState.ids : startOpen();
  const setUserOpen = (ids: ReadonlySet<number>) => setOpenState({ key: openKey, ids });

  const visible = (s: ShipTreeShip) =>
    s.typeID === selectedTypeID || hullMatches(statuses.get(s.typeID), filter);
  const shown = sections.filter((section) => hasVisible(section, tree, visible));

  // A search pick goes to the hull: its faction's tree, its section and the
  // ones above it opened, its row scrolled to — then its window opens beside.
  const [goTo, setGoTo] = useState<ShipTreeShip | null>(null);
  const goToHere = goTo !== null && goTo.factionID === tree.factionID;
  const goToPath = goToHere ? sectionPath(sections, goTo.treeGroupID) : [];
  // Opened during render (after any faction-switch reset above), so the row
  // exists by the time its ref below scrolls to it.
  if (goToPath.some((id) => !userOpen.has(id)))
    setOpenState({ key: openKey, ids: new Set([...userOpen, ...goToPath]) });
  // A jump lives only while its hull's window is open, and a hull the ladder
  // has no row for has nowhere to go: either way, drop it.
  if (
    goTo &&
    (goTo.typeID !== selectedTypeID ||
      (goToHere &&
        (goToPath.length === 0 ||
          !(tree.hulls.get(goTo.treeGroupID) ?? []).some((s) => s.typeID === goTo.typeID))))
  )
    setGoTo(null);
  const scrollToTypeID = goToHere && goToPath.every((id) => userOpen.has(id)) ? goTo.typeID : null;
  const scrollToRow = (row: HTMLElement | null) => {
    if (!row) return;
    // A phone's window is a bottom sheet, so the row goes to the top, above it.
    row.scrollIntoView({ block: sheetWindow ? 'start' : 'center' });
    setGoTo(null);
  };
  const pick = (ship: ShipTreeShip) => {
    setGoTo(ship);
    if (ship.factionID !== tree.factionID) onFaction(ship.factionID);
    onOpenShip(ship);
  };
  const search = (
    <MapSearch
      data={data}
      statuses={statuses}
      onPick={pick}
      className={narrow ? 'min-w-0 flex-1' : 'w-72'}
    />
  );
  const expandCollapse = (
    <>
      {/* `md`, not `sm`: these share the search box's line (Skills does the same). */}
      <IconButton
        icon={<Icon.ExpandAll />}
        label={t('ships.tree.expandAll')}
        onClick={() => setUserOpen(new Set(sectionIds))}
      />
      <IconButton
        icon={<Icon.CollapseAll />}
        label={t('ships.tree.collapseAll')}
        onClick={() => setUserOpen(new Set())}
      />
    </>
  );

  return (
    <div className="space-y-3">
      {narrow && (
        <div className="flex items-center gap-2">
          <span className="shrink-0">{viewSwitch}</span>
          <span className="flex-1" />
          <LegendPopover />
        </div>
      )}
      <FilterBar<ShipTreeFilter>
        value={filter}
        onChange={onFilter}
        activeCount={(filter.fly !== 'all' ? 1 : 0) + (masteryFilterActive(filter) ? 1 : 0)}
        title={t('ships.tree.filtersTitle')}
        search={
          narrow ? (
            search
          ) : (
            <>
              {viewSwitch}
              {search}
            </>
          )
        }
        trailing={
          narrow ? (
            expandCollapse
          ) : (
            <>
              {expandCollapse}
              <span className="flex-1" />
              <LegendPopover />
            </>
          )
        }
      >
        {(draft, setDraft) => (
          <TreeFilterFields
            draft={draft}
            setDraft={setDraft}
            flyCounts={flyCounts}
            tierCounts={tierCounts}
            masteriesUnavailable={source.masteriesStatus !== 'loaded'}
          />
        )}
      </FilterBar>
      {factionBar}
      <div className="space-y-1 rounded-xs border border-line bg-panel p-3">
        {shown.length > 0 ? (
          shown.map((section) => (
            <LadderClass
              key={section.def.id}
              section={section}
              depth={0}
              userOpen={userOpen}
              setUserOpen={setUserOpen}
              filter={filter}
              selectedTypeID={selectedTypeID}
              scrollToTypeID={scrollToTypeID}
              scrollToRow={scrollToRow}
              visible={visible}
              omegaChips={omegaChips}
              source={source}
              tree={tree}
              onFaction={onFaction}
              onOpenShip={onOpenShip}
            />
          ))
        ) : filtered ? (
          <NoFilterMatches
            factionName={factionNameOf(data.factions, tree.factionID)}
            others={inGameFactionOrder(data.factions).flatMap((f) => {
              const count = factionMatches?.get(f.id) ?? 0;
              return f.id !== tree.factionID && count > 0 ? [{ ...f, count }] : [];
            })}
            onFaction={onFaction}
            onClear={() => onFilter(NO_SHIP_TREE_FILTER)}
          />
        ) : (
          <p className="py-4 text-center text-sm text-text-dim">{t('ships.tree.noMatches')}</p>
        )}
      </div>
    </div>
  );
}

/** The tree's key, one press away instead of always taking toolbar room. */
function LegendPopover() {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>
          {t('ships.tree.legendButton')}
          <Icon.Expanded />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-3">
        <Legend className="flex-col items-start" />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The funnel's controls. Fly state: every hull, the flyable ones, the gaps,
 * each with the faction's own count. Mastery None–V, any number at once, each
 * with how many of this faction's hulls it would show; off under Can't fly
 * (Mastery is a can-fly property) and while the Mastery data hasn't loaded
 * (every tier would read None).
 */
function TreeFilterFields({
  draft,
  setDraft,
  flyCounts,
  tierCounts,
  masteriesUnavailable,
}: {
  draft: ShipTreeFilter;
  setDraft: (next: ShipTreeFilter) => void;
  flyCounts: Record<FlyState, number>;
  tierCounts: readonly number[];
  masteriesUnavailable: boolean;
}) {
  const { t } = useTranslation();
  const narrow = useIsNarrow();
  const reason = masteriesUnavailable
    ? t('ships.tree.mastery.unavailable')
    : draft.fly === 'cantFly'
      ? t('ships.tree.mastery.needsCanFly')
      : undefined;
  const toggle = (tier: number) => {
    const next = new Set(draft.mastery);
    if (!next.delete(tier)) next.add(tier);
    setDraft({ ...draft, mastery: next });
  };
  return (
    <>
      <FilterField label={t('ships.tree.fly.label')} stretch={false}>
        <SegmentedControl<FlyState>
          fill={narrow}
          label={t('ships.tree.fly.label')}
          options={[
            { value: 'all', label: t('ships.tree.fly.all', { n: flyCounts.all }) },
            { value: 'canFly', label: t('ships.tree.fly.canFly', { n: flyCounts.canFly }) },
            { value: 'cantFly', label: t('ships.tree.fly.cantFly', { n: flyCounts.cantFly }) },
          ]}
          value={draft.fly}
          onChange={(fly) => setDraft({ ...draft, fly })}
        />
      </FilterField>
      <FilterField label={t('ships.tree.mastery.label')} stretch={false}>
        <div
          role="group"
          aria-label={t('ships.tree.mastery.label')}
          className="flex flex-wrap items-center gap-1"
        >
          {MASTERY_TIERS.map((tier) => (
            <FilterChip
              key={tier}
              size="md"
              label={tier === 0 ? t('ships.tree.mastery.none') : romanLevel(tier)}
              count={tierCounts[tier]}
              countLabel={t('ships.tree.mastery.count', { count: tierCounts[tier] })}
              selected={draft.mastery.has(tier)}
              onToggle={() => toggle(tier)}
              disabled={reason !== undefined}
              tooltip={reason}
            />
          ))}
        </div>
      </FilterField>
    </>
  );
}

/** A chip that jumps to another faction's tree: a plain button, not a toggle. */
const jumpChipClassName = cx(
  'flex min-h-7 items-center gap-1 rounded-xs border border-line px-1.5 py-0.5 text-xs hover:border-line-bright hover:bg-panel-2 active:bg-panel',
  interactiveClassName,
  focusRingClassName
);

function NoFilterMatches({
  factionName,
  others,
  onFaction,
  onClear,
}: {
  factionName: string;
  others: readonly { id: number; name: string; count: number }[];
  onFaction: (factionID: number) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('ships.tree.noFactionMatches', { faction: factionName })}
      hint={others.length > 0 ? t('ships.tree.otherFactionsMatch') : undefined}
      action={
        <div className="flex flex-wrap items-center justify-center gap-1">
          {others.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFaction(f.id)}
              className={cx(jumpChipClassName, 'min-h-11 px-2 md:min-h-9')}
            >
              {f.name}
              <span className="tabular-nums opacity-80" aria-hidden="true">
                {f.count}
              </span>
              <span className="sr-only">{t('ships.tree.matchCount', { count: f.count })}</span>
            </button>
          ))}
          <Button onClick={onClear}>{t('ships.tree.clearFilters')}</Button>
        </div>
      }
    />
  );
}

function hasVisible(
  section: LadderSection,
  tree: FactionTree,
  visible: (s: ShipTreeShip) => boolean
): boolean {
  return (
    (tree.hulls.get(section.def.id) ?? []).some(visible) ||
    section.children.some((c) => hasVisible(c, tree, visible))
  );
}

/** "Mastery III" once a tier is trained, else "Can fly" or the time to fly. */
function rowLabel(t: TFunction, status: ShipTreeHullStatus | undefined): string {
  return status?.canFly && status.mastery > 0
    ? t('ships.tree.rowMastery', { level: romanLevel(status.mastery) })
    : flyLabel(t, status);
}

function LadderClass({
  section,
  depth,
  userOpen,
  setUserOpen,
  filter,
  selectedTypeID,
  scrollToTypeID,
  scrollToRow,
  visible,
  omegaChips,
  source,
  tree,
  onFaction,
  onOpenShip,
}: {
  section: LadderSection;
  depth: number;
  userOpen: ReadonlySet<number>;
  setUserOpen: (ids: ReadonlySet<number>) => void;
  filter: ShipTreeFilter;
  selectedTypeID: number | null;
  /** The row a search pick is going to, and the ref that scrolls to it. */
  scrollToTypeID: number | null;
  scrollToRow: (row: HTMLElement | null) => void;
  visible: (s: ShipTreeShip) => boolean;
  omegaChips: ReadonlySet<number>;
  source: ShipTreeSource;
  tree: FactionTree;
  onFaction: (factionID: number) => void;
  onOpenShip: (ship: ShipTreeShip) => void;
}) {
  const { t } = useTranslation();
  const { data, statuses, trainedLevel, skillName } = source;
  const id = section.def.id;
  const group = tree.group(id);
  const all = tree.hulls.get(id) ?? [];
  const ships = all.filter(visible);
  const children = section.children.filter((c) => hasVisible(c, tree, visible));
  const unlocked = tree.unlocked(id);
  const { flyable, total } = flyableCount(all, statuses);
  const matched = all.filter((s) => hullMatches(statuses.get(s.typeID), filter)).length;
  const skills = (group?.prereqsByFaction[String(tree.factionID)] ?? []).filter((p) => p.display);
  const empires = [...tree.parentEmpires(id)].reverse();
  const name = group?.name ?? '';
  const isOpen = userOpen.has(id);

  return (
    <details
      // Controlled, so Expand all and a filter change reach a section the
      // reader collapsed — React only writes the attribute when the prop changes.
      open={isOpen}
      onToggle={(e) => {
        const open = e.currentTarget.open;
        if (open === userOpen.has(id)) return;
        const next = new Set(userOpen);
        if (open) next.add(id);
        else next.delete(id);
        setUserOpen(next);
      }}
      data-class={id}
      data-unlocked={unlocked}
      className={cx(depth > 0 && 'ml-4 border-l border-line pl-3')}
    >
      <summary
        className={cx(
          'flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 py-1.5',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        <Caret expanded={isOpen} />
        {omegaChips.has(id) && (
          // A tap in a <summary> toggles the section, so no tap-to-reveal: hold shows these.
          <Tooltip content={t('ships.tree.omega')}>
            <span tabIndex={0} className="isis-omega-chip" data-omega="true">
              <span>Ω</span>
            </span>
          </Tooltip>
        )}
        <Tooltip content={classSkillTitle(t, name, skills, trainedLevel, skillName)}>
          <span tabIndex={0} className={cx('isis-icon isis-class-mini', !unlocked && 'locked')}>
            <img
              src={classIconUrl(group?.icon ?? '')}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          </span>
        </Tooltip>
        <span
          className={cx(
            'text-xs font-semibold tracking-widest uppercase',
            unlocked ? 'text-text' : 'text-text-dim'
          )}
        >
          {name}
        </span>
        <span className="flex items-center gap-0.5">
          <SkillBlocks skills={skills} trainedLevel={trainedLevel} />
        </span>
        <span className="ml-auto text-xs text-text-dim tabular-nums">
          {isShipTreeFiltered(filter)
            ? t('ships.tree.matchesOfTotal', { n: matched, total })
            : t('ships.tree.flyableOfTotal', { flyable, total })}
        </span>
      </summary>
      {empires.length === 2 && (
        <p className="mb-1 flex flex-wrap items-center gap-1 text-xs text-text-dim">
          <span>{t('ships.tree.needs')}</span>
          {empires.map((fid, i) => {
            const emblem = factionEmblemUrl(fid);
            const factionName = factionNameOf(data.factions, fid);
            return (
              <span key={fid} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true">·</span>}
                <button
                  type="button"
                  onClick={() => onFaction(fid)}
                  aria-label={t('ships.tree.switchFaction', { name: factionName })}
                  className={entityLinkClassName('flex min-h-7 items-center gap-1')}
                >
                  {emblem && (
                    <img
                      src={emblem}
                      alt=""
                      width={14}
                      height={14}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {factionName}
                </button>
              </span>
            );
          })}
        </p>
      )}
      <ul className="divide-y divide-line/60">
        {ships.map((s) => {
          const status = statuses.get(s.typeID);
          return (
            <li key={s.typeID}>
              <button
                type="button"
                data-ship={s.typeID}
                ref={s.typeID === scrollToTypeID ? scrollToRow : undefined}
                aria-current={s.typeID === selectedTypeID ? 'true' : undefined}
                onClick={() => onOpenShip(s)}
                className={cx(
                  // A transparent border, so the selected row's accent one doesn't shift it.
                  'group flex w-full scroll-mt-4 items-center gap-2 border-l-2 border-l-transparent px-1 py-1 text-left text-sm',
                  rowInteractiveClassName,
                  focusRingInsetClassName,
                  s.typeID === selectedTypeID && selectedRowClassName
                )}
              >
                <IsisThumb ship={s} status={status} />
                {/* The accent name is the cue that the row opens Ship Info. */}
                <span
                  className={cx(
                    'min-w-0 flex-1 truncate text-accent',
                    // Underline follows the whole row (group), unlike entityLinkClassName's own hover.
                    'underline decoration-transparent underline-offset-2 group-hover:decoration-current group-focus-visible:decoration-current',
                    !status?.canFly && 'opacity-70'
                  )}
                >
                  {s.name}
                </span>
                <span className="shrink-0 text-xs text-text-dim">{rowLabel(t, status)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {children.map((child) => (
        <LadderClass
          key={child.def.id}
          section={child}
          depth={depth + 1}
          userOpen={userOpen}
          setUserOpen={setUserOpen}
          filter={filter}
          selectedTypeID={selectedTypeID}
          scrollToTypeID={scrollToTypeID}
          scrollToRow={scrollToRow}
          visible={visible}
          omegaChips={omegaChips}
          source={source}
          tree={tree}
          onFaction={onFaction}
          onOpenShip={onOpenShip}
        />
      ))}
    </details>
  );
}
