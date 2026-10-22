/**
 * Text or file in, preview out: the one pipeline behind the Import dialog, a
 * skill plan pasted elsewhere in the app, and a plan file dropped on the
 * editor. Loads the catalogs on demand, so none of them ride the page's
 * initial load.
 */
import { loadTypeDetail } from '../typeDetail';
import { loadItemNameMap, loadSkillNameMap } from '../typeCatalog';
import { previewClipboardImport, type ClipboardImportPreview } from './clipboardImport';
import { previewPlanXmlImport } from './planXmlImport';

export async function previewImportText(text: string): Promise<ClipboardImportPreview> {
  const [skillByName, typeByName] = await Promise.all([loadSkillNameMap(), loadItemNameMap()]);
  return previewClipboardImport(text, {
    skillByName,
    typeByName,
    loadType: (typeId) => loadTypeDetail(typeId, { retry: true }),
  });
}

export async function previewImportFile(file: File): Promise<ClipboardImportPreview> {
  try {
    return await previewPlanXmlImport(file, await loadSkillNameMap());
  } catch {
    // previewPlanXmlImport is designed never to throw, but the catalog load
    // itself can; callers are floating promises (file input/drop handlers
    // can't await), so it must surface as an inline error, not a rejection.
    return {
      mode: 'planXml',
      entries: [],
      warnings: [],
      errors: [],
      documentErrorCode: 'readFailed',
    };
  }
}
