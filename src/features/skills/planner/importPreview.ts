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
    return {
      mode: 'planXml',
      entries: [],
      warnings: [],
      errors: [],
      documentErrorCode: 'readFailed',
    };
  }
}
