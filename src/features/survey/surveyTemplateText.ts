import { useTranslation } from 'react-i18next';
import { templateSummary, type InfoTemplate } from '@/engine/survey/infoTemplate';

export function useTemplateSummary(): (template: InfoTemplate) => string {
  const { t } = useTranslation();
  return (template) => {
    const { location, tax, hasNotes } = templateSummary(template);
    return [
      location,
      tax === null ? null : t('survey.templates.summaryTax', { pct: tax.pct, name: tax.name }),
      hasNotes ? t('survey.templates.summaryNotes') : null,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');
  };
}
