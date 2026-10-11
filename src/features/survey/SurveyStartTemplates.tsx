/**
 * Under the empty Survey page's hint: pick a template to start the field from,
 * or, with none saved yet, a line saying where they come from. Picking only
 * marks one; the Survey starts (and takes it) when the first scan is pasted.
 */
import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/ui';
import type { InfoTemplate } from '@/engine/survey/infoTemplate';

interface SurveyStartTemplatesProps {
  templates: readonly InfoTemplate[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function SurveyStartTemplates({
  templates,
  selectedId,
  onSelect,
}: SurveyStartTemplatesProps) {
  const { t } = useTranslation();
  if (templates.length === 0) {
    return <p className="text-center text-xs text-text-dim">{t('survey.templates.emptyHint')}</p>;
  }
  const selected = templates.find((template) => template.id === selectedId);
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-sm text-text-dim">{t('survey.templates.startFrom')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {templates.map((template) => (
          <FilterChip
            key={template.id}
            label={template.name}
            selected={template.id === selectedId}
            onToggle={() => onSelect(template.id === selectedId ? null : template.id)}
          />
        ))}
      </div>
      {selected !== undefined && (
        <p role="status" className="text-xs text-text-dim">
          {t('survey.templates.startingWith', { name: selected.name })}
        </p>
      )}
    </div>
  );
}
