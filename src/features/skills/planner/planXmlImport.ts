/**
 * Orchestrates the "Import from file" preview: parse a raw .emp/.xml plan
 * file, then resolve its entries against the skill catalog. Kept separate
 * from clipboardImport.ts's previewClipboardImport — the mode here is
 * decided by input channel (a file was dropped/picked), never by sniffing
 * content, so there's no dispatch ambiguity to share.
 */
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
    // `line` has no XML equivalent of a source line — it's the error's
    // position in this list only, kept as a stable React key alongside
    // `text`. The real locator (element index + skill name) is `e.path`,
    // reused here as `text` since that's the field the dialog renders.
    errors: errors.map((e, i) => ({ line: i + 1, text: e.path, reason: e.reason })),
  };
}
