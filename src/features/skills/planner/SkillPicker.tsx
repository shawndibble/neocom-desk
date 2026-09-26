import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, SearchInput } from '@/components/ui';
import { inlineLinkClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import type { SkillType } from '@/sde/types';
import type { PlanEntry, TrainedSkill } from '@/engine/types';
import { rankedSearch } from '@/lib/rankedSearch';
import { SkillRequirementsList } from '../SkillRequirementsList';
import { buildSkillRequirements } from '../skillRequirements';
import type { SkillCatalog } from '../skillMap';
import { entryId } from './reorder';

/** DOM id EntryList puts on each plan row — how the picker finds one to jump to. */
function planEntryElementId(skillTypeID: number, targetLevel: number): string {
  return `plan-entry-${entryId({ skillTypeID, targetLevel })}`;
}

/** Vertically on-screen right now — good enough for "does the pilot need a jump link". */
function isVerticallyInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.top >= 0 && rect.bottom <= window.innerHeight;
}

/** How long the visible confirmation stays up before fading back to sr-only. */
const ANNOUNCEMENT_VISIBLE_MS = 5000;

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
const MAX_RESULTS = 20;
/** Debounce for the skill search, matching Market.tsx's catalogue search — a fast typist doesn't re-rank ~500 skills on every keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

interface SkillPickerProps {
  skills: readonly SkillType[];
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  onAdd: (entry: PlanEntry) => void;
  className?: string;
  /**
   * Extra view controls (e.g. group-by, column visibility) rendered beside
   * the search box on the same row, wrapping below it on narrow screens.
   * These act on the entries list below, not the picker itself, but the
   * search bar is this panel's one full-width row wide enough to hold them.
   */
  controls?: ReactNode;
  /** The plan's own entries, so a level button can flag one already added at or above it (#408) — distinct from `trainedSkills`, which flags one already trained in-game. */
  planEntries?: readonly PlanEntry[];
}

/**
 * Searchable skill picker: ranked search by name/group/description, narrow by
 * group, then pick a target level I-V, showing that skill's prerequisites and
 * unlocks.
 */
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
  const [query, setQuery] = useState('');
  // Debounced separately from `query`: the input itself stays instantly
  // responsive, only the ~500-skill re-rank below waits out the debounce.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  // Sighted confirmation is shown only for a few seconds after a pick, then
  // this same `role="status"` text goes back to sr-only — one live region,
  // not a second one layered on top.
  const [announcementVisible, setAnnouncementVisible] = useState(false);
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);
  // Id of a just-added row not yet found in the DOM. Cleared once found;
  // re-picking before that replaces it, so an older pick has nothing left to
  // resolve into.
  const [pendingJumpElementId, setPendingJumpElementId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const hideAnnouncementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hideAnnouncementTimer.current) clearTimeout(hideAnnouncementTimer.current);
    },
    []
  );

  // `planEntries` changes on the same render pass `EntryList` mounts the new
  // row (both read off the same parent state), so re-checking whenever it
  // changes needs no polling: the row exists by the time this reruns, or a
  // newer pick has already replaced `pendingJumpElementId`.
  useEffect(() => {
    if (!pendingJumpElementId) return;
    const el = document.getElementById(pendingJumpElementId);
    if (!el) return;
    // Measuring committed DOM layout, not deriving from render-time props —
    // there's no non-effect way to know where the row actually landed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJumpTargetId(isVerticallyInViewport(el) ? null : el.id);
    setPendingJumpElementId(null);
  }, [pendingJumpElementId, planEntries]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  /**
   * Ranked over every skill rather than capped at MAX_RESULTS, so a group
   * chip both exists for, and can surface, a match that the unfiltered top-N
   * would crowd out with a more common group. Affordable where the Market
   * search's cap is not: the skill catalogue is ~500 entries, not ~9,000.
   */
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

  function pick(skillTypeID: number, targetLevel: number, skillName: string, levelLabel: string) {
    onAdd({ skillTypeID, targetLevel });
    setQuery('');
    setDebouncedQuery('');
    setSelected(null);
    setActiveGroups(new Set());
    // The results list just collapsed, unmounting the clicked button
    // (WCAG 2.4.3) — refocus the search box and announce the add. Cleared
    // first: an `aria-live` region only speaks on an actual DOM mutation.
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          ref={searchRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setActiveGroups(new Set());
          }}
          placeholder={t('plans.searchPlaceholder')}
          aria-label={t('plans.addSkill')}
          className="flex-1"
        />
        <span
          role="status"
          aria-live="polite"
          className={
            announcementVisible ? 'flex items-center gap-1.5 text-xs text-text-dim' : 'sr-only'
          }
        >
          {announcement}
          {announcementVisible && jumpTargetId && (
            <button
              type="button"
              className={inlineLinkClassName}
              onClick={() =>
                document
                  .getElementById(jumpTargetId)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            >
              {t('plans.jumpToAdded')}
            </button>
          )}
        </span>
        {controls && (
          <div className="flex flex-wrap items-center gap-2 text-xs whitespace-nowrap text-text-dim">
            {controls}
          </div>
        )}
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
      {results.length > 0 ? (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-xs border border-line bg-panel">
          {results.map((skill) => (
            <li key={skill.typeID} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => setSelected(selected === skill.typeID ? null : skill.typeID)}
                className={`${tappableRowClassName} flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
              >
                <span className="truncate">{skill.name}</span>
                <span className="shrink-0 text-text-dim">{skill.groupName}</span>
              </button>
              {selected === skill.typeID && (
                <div className="space-y-2 px-2 pb-2">
                  <div className="flex flex-wrap gap-1">
                    {ROMAN.map((roman, i) => {
                      const level = i + 1;
                      const trainedLevel = trainedSkills.get(skill.typeID)?.level ?? 0;
                      // The highest of this skill's rows, not the first one:
                      // a plan holds one entry per level, so `find` reports
                      // Gunnery I for a plan that trains I–V, and every level
                      // above it would offer an "add" the plan already covers
                      // and `upsertEntry` would discard.
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
                            <span className="ml-1 text-[0.625rem] uppercase">{t(flagKey)}</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                  {requirements && (
                    <SkillRequirementsList
                      prereqs={requirements.prereqs}
                      unlocks={requirements.unlocks}
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
