/**
 * The pilot's Survey info templates (`engine/survey/infoTemplate.ts`), as a
 * synced list so a second device can start a field from the same pick. A
 * template is the pilot's own: it stays in this list and never goes on a
 * Survey or its Share Link.
 */
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

/**
 * Every write below rewrites the list from the store's current value, never a
 * render's possibly stale one, after making sure the stored list was read: a
 * write before hydration would replace the saved templates with `[]`.
 */
async function edit(change: (list: readonly InfoTemplate[]) => InfoTemplate[]): Promise<void> {
  if (!useSurveyTemplates.getState().hydrated) await useSurveyTemplates.getState().hydrate();
  const { value, setValue } = useSurveyTemplates.getState();
  await setValue(change(value));
}

/** Saves under `name` (replacing a template of that name), or updates the one `id` names. Returns the saved template's id. */
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

/** Undo for a delete: back to its old place. */
export function restoreSurveyTemplate(template: InfoTemplate, index: number): Promise<void> {
  return edit((list) => insertTemplate(list, template, index));
}
