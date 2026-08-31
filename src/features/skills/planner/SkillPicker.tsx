import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip } from '@/components/ui';
import type { SkillType } from '@/sde/types';
import type { PlanEntry } from '@/engine/types';
import { rankedSearch } from '@/lib/rankedSearch';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
const MAX_RESULTS = 20;

interface SkillPickerProps {
  skills: readonly SkillType[];
  onAdd: (entry: PlanEntry) => void;
  className?: string;
}

/** Searchable skill picker: filter by name/group/description, narrow by group, pick a target level I-V. */
export function SkillPicker({ skills, onAdd, className = '' }: SkillPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set());

  /**
   * Ranked over every skill (not capped at MAX_RESULTS) so a group filter
   * chip can surface a match that would otherwise be crowded out of the
   * top-N by an unrelated, more common group.
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

  const filtered =
    activeGroups.size === 0 ? matches : matches.filter((s) => activeGroups.has(s.groupName));
  const results = filtered.slice(0, MAX_RESULTS);

  function toggleGroup(name: string) {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function pick(skillTypeID: number, targetLevel: number) {
    onAdd({ skillTypeID, targetLevel });
    setQuery('');
    setSelected(null);
    setActiveGroups(new Set());
  }

  return (
    <div className={className}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setActiveGroups(new Set());
        }}
        placeholder={t('plans.searchPlaceholder')}
        aria-label={t('plans.addSkill')}
        className="h-8 w-full rounded-xs border border-line bg-panel-2 px-2 text-xs text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
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
                <div className="flex gap-1 px-2 pb-2">
                  {ROMAN.map((roman, i) => (
                    <Button key={roman} size="sm" onClick={() => pick(skill.typeID, i + 1)}>
                      {t('plans.level', { level: roman })}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
