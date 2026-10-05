/**
 * The Ship Tree read top to bottom (phone default): one section per main-
 * and industry-line class, specialised classes nested and collapsible under
 * their parent. Carries the map's marks — lit/dim class icon, skill bars,
 * Ω, tech corners, tone, Mastery badge — at list size. A tap on a hull
 * opens the Ship Info window (the caller's).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, Checkbox, entityLinkClassName, SearchInput, Tooltip } from '@/components/ui';
import {
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { ShipTreeShip } from '@/sde/types';
import { FlyDot } from './FlyDot';
import { IsisThumb } from './IsisTile';
import { Legend } from './Legend';
import { SkillBlocks } from './SkillBlocks';
import { classSkillTitle } from './classSkillTitle';
import { flyLabel } from './flyLabel';
import { classIconUrl, factionEmblemUrl } from './shipTreeAssets';
import {
  factionNameOf,
  flyableCount,
  ladderSections,
  searchHulls,
  type LadderSection,
} from './shipTreeModel';
import type { FactionTree } from './useFactionTree';
import type { ShipTreeSource } from './useShipTreeData';

interface LadderProps {
  source: ShipTreeSource;
  tree: FactionTree;
  onFaction: (factionID: number) => void;
  onOpenShip: (ship: ShipTreeShip) => void;
  viewSwitch: ReactNode;
}

export function ShipTreeLadder({ source, tree, onFaction, onOpenShip, viewSwitch }: LadderProps) {
  const { t } = useTranslation();
  const { data, statuses } = source;
  const [query, setQuery] = useState('');
  const [onlyFlyable, setOnlyFlyable] = useState(false);
  const q = query.trim().toLowerCase();

  const sections = useMemo(() => ladderSections(tree.defs), [tree.defs]);
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

  const visible = (s: ShipTreeShip) =>
    (!q || s.name.toLowerCase().includes(q)) &&
    (!onlyFlyable || statuses.get(s.typeID)?.canFly === true);

  const shown = sections.filter((section) => hasVisible(section, tree, visible));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {viewSwitch}
        <SearchInput
          className="w-full sm:w-72"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('ships.tree.filterPlaceholder')}
          aria-label={t('ships.tree.filterLabel')}
        />
        <label className="flex items-center gap-1.5 text-xs text-text-dim">
          <Checkbox checked={onlyFlyable} onChange={(e) => setOnlyFlyable(e.target.checked)} />
          {t('ships.tree.onlyFlyable')}
        </label>
        <span className="flex-1" />
        <Legend />
      </div>
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
              visible={visible}
              omegaChips={omegaChips}
              source={source}
              tree={tree}
              onFaction={onFaction}
              onOpenShip={onOpenShip}
            />
          ))
        ) : (
          <p className="py-4 text-center text-sm text-text-dim">{t('ships.tree.noMatches')}</p>
        )}
      </div>
    </div>
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

function LadderClass({
  section,
  depth,
  searching,
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
  const skills = (group?.prereqsByFaction[String(tree.factionID)] ?? []).filter((p) => p.display);
  const empires = [...tree.parentEmpires(id)].reverse();
  const name = group?.name ?? '';
  // Top level starts open; the reader's own toggles stick. A search opens
  // everything over that, and clearing it puts their choice back. `open` is
  // controlled so a section they collapsed still opens for a search — React
  // only writes the attribute when the prop changes.
  const [userOpen, setUserOpen] = useState(depth === 0);

  return (
    <details
      open={searching || userOpen}
      onToggle={(e) => {
        if (!searching) setUserOpen(e.currentTarget.open);
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
        <Caret expanded={searching || userOpen} />
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
          {t('ships.tree.flyableOfTotal', { flyable, total })}
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
                <span className="shrink-0 text-xs text-text-dim">{flyLabel(t, status)}</span>
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
