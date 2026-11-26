import { parseSkillPlanXml, type SkillCatalog } from '@/engine/import/skillPlanXml';
import { parsePlanXmlFile } from './planXmlDocument';
import type { ClipboardImportPreview } from './clipboardImport';

export async function previewPlanXmlImport(
  file: File,
  skillByName: SkillCatalog
): Promise<ClipboardImportPreview> {
  const docResult = await parsePlanXmlFile(file);
  if (!docResult.ok) {
    return {
      mode: 'planXml',
      entries: [],
      warnings: [],
      errors: [],
      documentErrorCode: docResult.error.code,
    };
  }

  const { entries, errors } = parseSkillPlanXml(docResult.document, skillByName);
  return {
    mode: 'planXml',
    planName: docResult.document.name,
    entries,
    warnings: [],
    errors: errors.map((e, i) => ({ line: i + 1, text: e.path, reason: e.reason })),
  };
}
