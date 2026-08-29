import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { SkillType } from '@/sde/types';
import type { PlanEntry } from '@/engine/types';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
const MAX_RESULTS = 20;

interface SkillPickerProps {
  skills: readonly SkillType[];
  onAdd: (entry: PlanEntry) => void;
  className?: string;
}

/** Searchable skill picker: filter by name/group, then pick a target level I-V. */
export function SkillPicker({ skills, onAdd, className = '' }: SkillPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return skills
      .filter((s) => s.name.toLowerCase().includes(q) || s.groupName.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [skills, query]);

  function pick(skillTypeID: number, targetLevel: number) {
    onAdd({ skillTypeID, targetLevel });
    setQuery('');
    setSelected(null);
  }

  return (
    <div className={className}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
        }}
        placeholder={t('plans.searchPlaceholder')}
        aria-label={t('plans.addSkill')}
        className="h-8 w-full rounded-xs border border-line bg-panel-2 px-2 text-xs text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
      />
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
