import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, SearchInput } from '@/components/ui';
import type { SkillType } from '@/sde/types';
import type { PlanEntry, TrainedSkill } from '@/engine/types';
import { rankedSearch } from '@/lib/rankedSearch';
import { SkillRequirementsList } from '../SkillRequirementsList';
import { buildSkillRequirements } from '../skillRequirements';
import type { SkillCatalog } from '../skillMap';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
const MAX_RESULTS = 20;

interface SkillPickerProps {
  skills: readonly SkillType[];
  catalog: SkillCatalog;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  onAdd: (entry: PlanEntry) => void;
  className?: string;
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
}: SkillPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set());

  /**
   * Ranked over every skill rather than capped at MAX_RESULTS, so a group
   * chip both exists for, and can surface, a match that the unfiltered top-N
   * would crowd out with a more common group. Affordable where the Market
   * search's cap is not: the skill catalogue is ~500 entries, not ~9,000.
   */
  const matches = useMemo(
    () =>
      rankedSearch(skills, query, {
        primary: (s) => s.name,
        secondary: [(s) => s.groupName, (s) => s.description],
        limit: skills.length,
      }),
    [skills, query]
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

  function pick(skillTypeID: number, targetLevel: number) {
    onAdd({ skillTypeID, targetLevel });
    setQuery('');
    setSelected(null);
    setActiveGroups(new Set());
  }

  return (
    <div className={className}>
      <SearchInput
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setActiveGroups(new Set());
        }}
        placeholder={t('plans.searchPlaceholder')}
        aria-label={t('plans.addSkill')}
      />
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
      {results.length > 0 && (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-xs border border-line bg-panel">
          {results.map((skill) => (
            <li key={skill.typeID} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => setSelected(selected === skill.typeID ? null : skill.typeID)}
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-panel-2"
              >
                <span className="truncate">{skill.name}</span>
                <span className="shrink-0 text-text-faint">{skill.groupName}</span>
              </button>
              {selected === skill.typeID && (
                <div className="space-y-2 px-2 pb-2">
                  <div className="flex gap-1">
                    {ROMAN.map((roman, i) => (
                      <Button key={roman} size="sm" onClick={() => pick(skill.typeID, i + 1)}>
                        {t('plans.level', { level: roman })}
                      </Button>
                    ))}
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
      )}
    </div>
  );
}
