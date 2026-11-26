import {
  deleteTemplate,
  findTemplateByName,
  insertTemplate,
  parseInfoTemplates,
  renameTemplate,
  saveTemplate,
  type InfoTemplate,
  type InfoTemplateFields,
} from '@/engine/survey/infoTemplate';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_SURVEY_INFO_TEMPLATES_KEY = 'sync.surveyInfoTemplates';

export const useSurveyTemplates = createSyncedSetting<InfoTemplate[]>({
  key: SYNCED_SURVEY_INFO_TEMPLATES_KEY,
  defaultValue: [],
  parse: parseInfoTemplates,
});

async function edit(change: (list: readonly InfoTemplate[]) => InfoTemplate[]): Promise<void> {
  if (!useSurveyTemplates.getState().hydrated) await useSurveyTemplates.getState().hydrate();
  const { value, setValue } = useSurveyTemplates.getState();
  await setValue(change(value));
}

export async function saveSurveyTemplate(input: {
  id?: string;
  name: string;
  fields: InfoTemplateFields;
}): Promise<string | null> {
  let savedId: string | null = null;
  await edit((list) => {
    const fresh = crypto.randomUUID();
    const next = saveTemplate(list, input, () => fresh);
    const target = list.find((t) => t.id === input.id) ?? findTemplateByName(list, input.name);
    savedId = next.some((t) => t.id === (target?.id ?? fresh)) ? (target?.id ?? fresh) : null;
    return next;
  });
  return savedId;
}

export function renameSurveyTemplate(id: string, name: string): Promise<void> {
  return edit((list) => renameTemplate(list, id, name));
}

export function deleteSurveyTemplate(id: string): Promise<void> {
  return edit((list) => deleteTemplate(list, id));
}

export function restoreSurveyTemplate(template: InfoTemplate, index: number): Promise<void> {
  return edit((list) => insertTemplate(list, template, index));
}
