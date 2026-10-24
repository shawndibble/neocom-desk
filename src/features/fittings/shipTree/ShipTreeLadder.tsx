/**
 * The Ship Tree read top to bottom (phone default): one section per main-
 * and industry-line class, specialised classes nested and collapsible under
 * their parent. Carries the map's marks — lit/dim class icon, skill bars,
 * Ω, tech corners, tone, Mastery badge — at list size. A tap on a hull
 * opens the Ship Info window (the caller's).
 *
 * Filtered for picking what to train: fly-state tabs with the faction's own
 * split, and a Mastery pick behind the funnel. The filter is the caller's
 * (it lives in the URL and also feeds the faction bar's counts).
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
  SearchInput,
  SegmentedControl,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { romanLevel } from '@/engine/projection';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';
import { useIsNarrow } from '@/lib/useIsNarrow';
import type { ShipTreeShip } from '@/sde/types';
import { FlyDot } from './FlyDot';
import { IsisThumb } from './IsisTile';
import { Legend } from './Legend';
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
  MASTERY_TIERS,
  masteryCounts,
  masteryFilterActive,
  NO_SHIP_TREE_FILTER,
  searchHulls,
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
  onFaction,
  onOpenShip,
  viewSwitch,
}: LadderProps) {
  const { t } = useTranslation();
  const { data, statuses } = source;
  const narrow = useIsNarrow();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = isShipTreeFiltered(filter);

  const sections = useMemo(() => ladderSections(tree.defs), [tree.defs]);
  const sectionIds = useMemo(() => allSectionIds(sections), [sections]);
  const omegaChips = useMemo(
    () => new Set(tree.layout.omegas.map((o) => o.classId)),
    [tree.layout]
  );
  const elsewhere = useMemo(
    () =>
      searchHulls(
        data.ships.filter((s) => s.factionID !== tree.factionID),
        q
      ),
    [data, q, tree.factionID]
  );
  const factionShips = useMemo(
    () => data.ships.filter((s) => s.factionID === tree.factionID),
    [data, tree.factionID]
  );
  const flyCounts = flyStateCounts(factionShips, statuses);
  const tierCounts = masteryCounts(factionShips, statuses);

  // The reader's open sections, per faction. Top level starts open — every
  // section while filtered, so a match in a sub-class can't hide. A search
  // opens everything over this; clearing it puts their choice back.
  const [openState, setOpenState] = useState<{
    factionID: number;
    ids: ReadonlySet<number>;
  } | null>(null);
  const userOpen =
    openState?.factionID === tree.factionID
      ? openState.ids
      : new Set(filtered ? sectionIds : sections.map((s) => s.def.id));
  const setUserOpen = (ids: ReadonlySet<number>) =>
    setOpenState({ factionID: tree.factionID, ids });
  const setFilter = (next: ShipTreeFilter) => {
    onFilter(next);
    setUserOpen(new Set(sectionIds));
  };

  const visible = (s: ShipTreeShip) =>
    (!q || s.name.toLowerCase().includes(q)) && hullMatches(statuses.get(s.typeID), filter);
  const shown = sections.filter((section) => hasVisible(section, tree, visible));

  const flyTabs = (
    <SegmentedControl<FlyState>
      size="md"
      fill={narrow}
      label={t('ships.tree.fly.label')}
      options={[
        { value: 'all', label: t('ships.tree.fly.all', { n: flyCounts.all }) },
        { value: 'canFly', label: t('ships.tree.fly.canFly', { n: flyCounts.canFly }) },
        { value: 'cantFly', label: t('ships.tree.fly.cantFly', { n: flyCounts.cantFly }) },
      ]}
      value={filter.fly}
      onChange={(fly) => setFilter({ ...filter, fly })}
    />
  );
  const expandCollapse = (
    <>
      {/* `md`, not `sm`: these share the search box's line (Skills does the same). */}
      <IconButton
        icon={<Icon.ExpandAll />}
        label={t('skills.expandAll')}
        onClick={() => setUserOpen(new Set(sectionIds))}
        disabled={q !== ''}
      />
      <IconButton
        icon={<Icon.CollapseAll />}
        label={t('skills.collapseAll')}
        onClick={() => setUserOpen(new Set())}
        disabled={q !== ''}
      />
    </>
  );
  const search = (
    <SearchInput
      className={narrow ? 'min-w-0 flex-1' : 'w-72'}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={t('ships.tree.filterPlaceholder')}
      aria-label={t('ships.tree.filterLabel')}
    />
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
        onChange={setFilter}
        activeCount={masteryFilterActive(filter) ? 1 : 0}
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
        actions={
          narrow ? (
            expandCollapse
          ) : (
            <>
              {flyTabs}
              {expandCollapse}
              <span className="flex-1" />
              <LegendPopover />
            </>
          )
        }
      >
        {(draft, setDraft) => (
          <MasteryField
            draft={draft}
            setDraft={setDraft}
            counts={tierCounts}
            unavailable={source.masteriesStatus !== 'loaded'}
          />
        )}
      </FilterBar>
      {narrow && flyTabs}
      {elsewhere.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-text-dim">{t('ships.tree.otherFactions')}</span>
          {elsewhere.map((s) => (
            <button
              key={s.typeID}
              type="button"
              onClick={() => {
                onFaction(s.factionID);
                onOpenShip(s);
              }}
              className={cx(
                'flex min-h-7 items-center gap-1 rounded-xs border border-line px-1.5 py-0.5 hover:border-line-bright hover:bg-panel-2 active:bg-panel',
                interactiveClassName,
                focusRingClassName
              )}
            >
              <FlyDot status={statuses.get(s.typeID)} />
              {statuses.get(s.typeID) && (
                <span className="sr-only">{flyLabel(t, statuses.get(s.typeID))}</span>
              )}
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-1 rounded-xs border border-line bg-panel p-3">
        {shown.length > 0 ? (
          shown.map((section) => (
            <LadderClass
              key={section.def.id}
              section={section}
              depth={0}
              searching={q !== ''}
              userOpen={userOpen}
              setUserOpen={setUserOpen}
              filter={filter}
              visible={visible}
              omegaChips={omegaChips}
              source={source}
              tree={tree}
              onFaction={onFaction}
              onOpenShip={onOpenShip}
            />
          ))
        ) : filtered && !q ? (
          <NoFilterMatches
            factionName={factionNameOf(data.factions, tree.factionID)}
            others={inGameFactionOrder(data.factions).filter(
              (f) => f.id !== tree.factionID && (factionMatches?.get(f.id) ?? 0) > 0
            )}
            factionMatches={factionMatches}
            onFaction={onFaction}
            onClear={() => setFilter(NO_SHIP_TREE_FILTER)}
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
 * Mastery None–V, any number at once, each with how many of this faction's
 * hulls it would show. Off under Can't fly (Mastery is a can-fly property)
 * and while the Mastery data hasn't loaded (every tier would read None).
 */
function MasteryField({
  draft,
  setDraft,
  counts,
  unavailable,
}: {
  draft: ShipTreeFilter;
  setDraft: (next: ShipTreeFilter) => void;
  counts: readonly number[];
  unavailable: boolean;
}) {
  const { t } = useTranslation();
  const reason = unavailable
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
            count={counts[tier]}
            countLabel={t('ships.tree.mastery.count', { n: counts[tier] })}
            selected={draft.mastery.has(tier)}
            onToggle={() => toggle(tier)}
            disabled={reason !== undefined}
            tooltip={reason}
          />
        ))}
      </div>
    </FilterField>
  );
}

function NoFilterMatches({
  factionName,
  others,
  factionMatches,
  onFaction,
  onClear,
}: {
  factionName: string;
  others: readonly { id: number; name: string }[];
  factionMatches: ReadonlyMap<number, number> | undefined;
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
            <FilterChip
              key={f.id}
              size="md"
              label={f.name}
              count={factionMatches?.get(f.id) ?? 0}
              selected={false}
              onToggle={() => onFaction(f.id)}
            />
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
  searching,
  userOpen,
  setUserOpen,
  filter,
  visible,
  omegaChips,
  source,
  tree,
  onFaction,
  onOpenShip,
}: {
  section: LadderSection;
  depth: number;
  searching: boolean;
  userOpen: ReadonlySet<number>;
  setUserOpen: (ids: ReadonlySet<number>) => void;
  filter: ShipTreeFilter;
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
  const isOpen = searching || userOpen.has(id);

  return (
    <details
      // Controlled, so a section the reader collapsed still opens for a search
      // or Expand all — React only writes the attribute when the prop changes.
      open={isOpen}
      onToggle={(e) => {
        const open = e.currentTarget.open;
        if (searching || open === userOpen.has(id)) return;
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
                onClick={() => onOpenShip(s)}
                className={cx(
                  'group flex w-full items-center gap-2 px-1 py-1 text-left text-sm',
                  rowInteractiveClassName,
                  focusRingInsetClassName
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
          searching={searching}
          userOpen={userOpen}
          setUserOpen={setUserOpen}
          filter={filter}
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
