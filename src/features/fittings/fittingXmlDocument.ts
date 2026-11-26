import type {
  FittingXmlDocument,
  FittingXmlEntry,
  FittingXmlHardware,
} from '@/engine/import/eveFitXml';

export type FittingXmlDocumentErrorCode =
  'tooLarge' | 'readFailed' | 'malformedXml' | 'unsupportedFormat' | 'empty';

export interface FittingXmlDocumentError {
  code: FittingXmlDocumentErrorCode;
}

export type FittingXmlDocumentResult =
  { ok: true; document: FittingXmlDocument } | { ok: false; error: FittingXmlDocumentError };

const MAX_BYTES = 2 * 1024 * 1024;

function containsDoctype(text: string): boolean {
  return /<!DOCTYPE/i.test(text);
}

function readHardware(fittingEl: Element): FittingXmlHardware[] {
  const hardware: FittingXmlHardware[] = [];
  for (const el of Array.from(fittingEl.getElementsByTagName('hardware'))) {
    const slot = el.getAttribute('slot');
    const type = el.getAttribute('type');
    if (!slot || !type) continue;
    const qtyAttr = el.getAttribute('qty');
    const qty = qtyAttr ? Number(qtyAttr) : undefined;
    hardware.push({
      slot,
      type,
      ...(qty !== undefined && Number.isInteger(qty) && qty > 0 ? { qty } : {}),
    });
  }
  return hardware;
}

function readEntries(root: Element): FittingXmlEntry[] {
  const entries: FittingXmlEntry[] = [];
  for (const el of Array.from(root.getElementsByTagName('fitting'))) {
    const name = el.getAttribute('name') ?? '';
    const shipTypeName = el.getElementsByTagName('shipType')[0]?.getAttribute('value') ?? '';
    entries.push({ name, shipTypeName, hardware: readHardware(el) });
  }
  return entries;
}

export function parseFittingXmlText(text: string): FittingXmlDocumentResult {
  if (containsDoctype(text)) {
    return { ok: false, error: { code: 'unsupportedFormat' } };
  }

  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { ok: false, error: { code: 'malformedXml' } };
  }

  const root = doc.documentElement;
  if (root.nodeName !== 'fittings') {
    return { ok: false, error: { code: 'unsupportedFormat' } };
  }

  const entries = readEntries(root);
  if (entries.length === 0) {
    return { ok: false, error: { code: 'empty' } };
  }
  return { ok: true, document: { entries } };
}

export async function parseFittingXmlFile(file: File): Promise<FittingXmlDocumentResult> {
  if (file.size > MAX_BYTES) {
    return { ok: false, error: { code: 'tooLarge' } };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: { code: 'readFailed' } };
  }
  return parseFittingXmlText(text);
}
