import { romanLevel } from '@/engine/projection';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Caret, FilterChip, LiveStatus, SearchInput } from '@/components/ui';
import { PLAN_HANDLE_ATTR } from './focusNeighbour';
import {
  focusRingInsetClassName,
  inlineLinkClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { SkillType } from '@/sde/types';
import type { PlanEntry, TrainedSkill } from '@/engine/types';
import { rankedSearch } from '@/lib/rankedSearch';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useItemUnlocks } from '../loadItemUnlocks';
import { SkillRequirementsList } from '../SkillRequirementsList';
import { buildSkillRequirements } from '../skillRequirements';
import type { SkillCatalog } from '../skillMap';
import { entryId } from './reorder';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';

function planEntryElementId(skillTypeID: number, targetLevel: number): string {
  return `plan-entry-${entryId({ skillTypeID, targetLevel })}`;
}

function isVerticallyInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.top >= 0 && rect.bottom <= window.innerHeight;
}

const ANNOUNCEMENT_VISIBLE_MS = 5000;

const MAX_RESULTS = 20;
interface SkillPickerProps {
  skills: readonly SkillType[];
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  onAdd: (entry: PlanEntry) => void;
  className?: string;
  controls?: ReactNode;
  planEntries?: readonly PlanEntry[];
}

export function SkillPicker({
  skills,
  catalog,
  trainedSkills,
  onAdd,
  className = '',
  controls,
  planEntries = [],
}: SkillPickerProps) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useDebouncedValue(query);
  const [selected, setSelected] = useState<number | null>(null);
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const [announcementVisible, setAnnouncementVisible] = useState(false);
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);
  const [pendingJumpElementId, setPendingJumpElementId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const hideAnnouncementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hideAnnouncementTimer.current) clearTimeout(hideAnnouncementTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!pendingJumpElementId) return;
    const el = document.getElementById(pendingJumpElementId);
    if (!el) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJumpTargetId(isVerticallyInViewport(el) ? null : el.id);
    setPendingJumpElementId(null);
  }, [pendingJumpElementId, planEntries]);

  const matches = useMemo(
    () =>
      rankedSearch(skills, debouncedQuery, {
        primary: (s) => s.name,
        secondary: [(s) => s.groupName, (s) => s.description],
        limit: skills.length,
      }),
    [skills, debouncedQuery]
  );

  const groups = useMemo(
    () => [...new Set(matches.map((s) => s.groupName))].sort((a, b) => a.localeCompare(b)),
    [matches]
  );

  const results = (
    activeGroups.size === 0 ? matches : matches.filter((s) => activeGroups.has(s.groupName))
  ).slice(0, MAX_RESULTS);

  function toggleGroup(name: string) {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const requirements = useMemo(
    () => (selected === null ? null : buildSkillRequirements(catalog, trainedSkills, selected)),
    [selected, catalog, trainedSkills]
  );
  const itemUnlocks = useItemUnlocks(selected);

  function pick(skillTypeID: number, targetLevel: number, skillName: string, levelLabel: string) {
    onAdd({ skillTypeID, targetLevel });
    setQuery('');
    setDebouncedQuery('');
    setSelected(null);
    setActiveGroups(new Set());
    setAnnouncement('');
    window.setTimeout(() => {
      setAnnouncement(t('plans.addedAnnouncement', { skill: skillName, level: levelLabel }));
      setAnnouncementVisible(true);
      setJumpTargetId(null);
      setPendingJumpElementId(planEntryElementId(skillTypeID, targetLevel));
      if (hideAnnouncementTimer.current) clearTimeout(hideAnnouncementTimer.current);
      hideAnnouncementTimer.current = setTimeout(() => {
        setAnnouncementVisible(false);
      }, ANNOUNCEMENT_VISIBLE_MS);
    }, 0);
    searchRef.current?.focus();
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          ref={searchRef}
          inputClassName="lg:scroll-mt-40"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setActiveGroups(new Set());
          }}
          placeholder={t('plans.searchPlaceholder')}
          aria-label={t('plans.addSkill')}
          className="min-w-32 flex-1"
        />
        {controls && (
          <div className="flex shrink-0 items-center gap-2 text-xs whitespace-nowrap text-text-dim">
            {controls}
          </div>
        )}
        <span
          role="status"
          aria-live="polite"
          data-testid="pick-status"
          className={
            announcementVisible
              ? 'flex basis-full items-center gap-1.5 text-xs text-text-dim sm:basis-auto'
              : 'sr-only'
          }
        >
          {announcement}
          {announcementVisible && jumpTargetId && (
            <button
              type="button"
              className={inlineLinkClassName}
              onClick={() => {
                const row = document.getElementById(jumpTargetId);
                row?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
                row
                  ?.querySelector<HTMLElement>(`[${PLAN_HANDLE_ATTR}]`)
                  ?.focus({ preventScroll: true });
              }}
            >
              {t('plans.jumpToAdded')}
            </button>
          )}
        </span>
      </div>
      {groups.length > 1 && (
        <div
          className="mt-1.5 flex flex-wrap gap-1.5"
          role="group"
          aria-label={t('plans.filterByGroup')}
        >
          {groups.map((name) => (
            <FilterChip
              key={name}
              label={name}
              selected={activeGroups.has(name)}
              onToggle={() => toggleGroup(name)}
            />
          ))}
        </div>
      )}
      <LiveStatus>
        {debouncedQuery.trim() === ''
          ? null
          : results.length > 0
            ? t('plans.searchResultCount', { count: results.length })
            : t('plans.noSkillsMatch', { query: debouncedQuery })}
      </LiveStatus>
      {results.length > 0 ? (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-xs border border-line bg-panel">
          {results.map((skill) => (
            <li key={skill.typeID} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => setSelected(selected === skill.typeID ? null : skill.typeID)}
                aria-expanded={selected === skill.typeID}
                className={cx(
                  tappableRowClassName,
                  'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs',
                  rowInteractiveClassName,
                  focusRingInsetClassName
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Caret expanded={selected === skill.typeID} />
                  <span className="truncate">{skill.name}</span>
                </span>
                <span className="shrink-0 text-text-dim">{skill.groupName}</span>
              </button>
              {selected === skill.typeID && (
                <div className="space-y-2 px-2 pb-2">
                  <div className="flex flex-wrap gap-1">
                    {[1, 2, 3, 4, 5].map((level) => {
                      const roman = romanLevel(level);
                      const trainedLevel = trainedSkills.get(skill.typeID)?.level ?? 0;
                      const planLevel = planEntries.reduce(
                        (highest, e) =>
                          e.skillTypeID === skill.typeID
                            ? Math.max(highest, e.targetLevel)
                            : highest,
                        0
                      );
                      const alreadyTrained = trainedLevel >= level;
                      const alreadyInPlan = !alreadyTrained && planLevel >= level;
                      const flagKey = alreadyTrained
                        ? 'plans.alreadyTrained'
                        : alreadyInPlan
                          ? 'plans.alreadyInPlan'
                          : null;
                      return (
                        <Button
                          key={roman}
                          size="sm"
                          className={flagKey ? 'text-text-dim' : undefined}
                          onClick={() =>
                            pick(
                              skill.typeID,
                              level,
                              skill.name,
                              t('plans.level', { level: roman })
                            )
                          }
                        >
                          {t('plans.level', { level: roman })}
                          {flagKey && (
                            <span className="ml-1 text-[0.6875rem] uppercase">{t(flagKey)}</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                  {requirements && (
                    <SkillRequirementsList
                      skillTypeID={skill.typeID}
                      prereqs={requirements.prereqs}
                      unlocks={requirements.unlocks}
                      itemUnlocks={itemUnlocks}
                      trainedLevel={trainedSkills.get(skill.typeID)?.level ?? 0}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        debouncedQuery.trim() !== '' && (
          <p className="mt-1 text-xs text-text-dim">
            {t('plans.noSkillsMatch', { query: debouncedQuery })}
          </p>
        )
      )}
    </div>
  );
}
