/**
 * The Templates control in the Additional information panel's header: pick a
 * saved template to fill the panel, save the current fields as one, or open the
 * list to rename, update and delete them. What the panel does with a pick is
 * the editor's call (`SurveyInfoEditor`); this only lists and reports.
 */
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { Expanded, Select } from '@/components/ui/icons';
import type { InfoTemplate } from '@/engine/survey/infoTemplate';
import { useTemplateSummary } from './surveyTemplateText';

interface SurveyTemplateMenuProps {
  templates: readonly InfoTemplate[];
  appliedId: string | null;
  onApply: (template: InfoTemplate) => void;
  onSave: () => void;
  onManage: () => void;
}

export function SurveyTemplateMenu({
  templates,
  appliedId,
  onApply,
  onSave,
  onManage,
}: SurveyTemplateMenuProps) {
  const { t } = useTranslation();
  const summary = useTemplateSummary();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          {t('survey.templates.menu')}
          <Expanded aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64 max-w-80">
        {templates.length === 0 ? (
          <DropdownMenuLabel>{t('survey.templates.none')}</DropdownMenuLabel>
        ) : (
          templates.map((template) => {
            const inUse = template.id === appliedId;
            return (
              <DropdownMenuItem
                key={template.id}
                onSelect={() => onApply(template)}
                className="items-start"
              >
                <span aria-hidden className="mt-0.5 inline-block w-4 shrink-0">
                  {inUse && <Select className="text-accent" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{template.name}</span>
                  <span className="truncate text-xs text-text-dim">{summary(template)}</span>
                </span>
                {inUse && <span className="sr-only">{t('survey.templates.inUse')}</span>}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSave}>{t('survey.templates.saveCurrent')}</DropdownMenuItem>
        {templates.length > 0 && (
          <DropdownMenuItem onSelect={onManage}>{t('survey.templates.manage')}</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
