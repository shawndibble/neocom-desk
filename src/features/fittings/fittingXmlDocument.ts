/**
 * Turn a raw EVE fittings-XML export into the plain, engine-safe
 * `FittingXmlDocument` `engine/import/eveFitXml.ts` consumes. This is the
 * only module that touches `DOMParser` — a `Document`/`Element` never
 * crosses into `src/engine`, only this module's plain output does (mirrors
 * `features/skills/planner/planXmlDocument.ts`).
 *
 * The export always wraps in a `<fittings>` root, even for a single fit —
 * "one `<fitting>` child" is exactly how a single-fit export is told apart
 * from a corp doctrine folder's multi-fit export; there is no separate
 * single-fit format to detect.
 */
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

// A corp doctrine folder's export is still tiny XML even with dozens of
// fits; this cap only exists to reject a malicious/corrupt file cheaply.
const MAX_BYTES = 2 * 1024 * 1024;

/** Legitimate exports never carry a DOCTYPE — rejecting it removes XXE/entity-expansion as a concern before DOMParser ever sees the text. */
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
    // A malformed/negative/fractional count reads as "not stated" — the same
    // "unknown gracefully becomes absent" stance planXmlDocument.ts's own
    // attribute parsing takes — rather than propagating a stack size that
    // could never occur in game.
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

/** Parses already-read XML text. Never throws: every failure mode returns `{ ok: false, error }`. */
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

/** Parses a picked/dropped fittings-XML file. Never throws. */
export async function parseFittingXmlFile(file: File): Promise<FittingXmlDocumentResult> {
  if (file.size > MAX_BYTES) {
    return { ok: false, error: { code: 'tooLarge' } };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    // A File handle can reject on read (removed/renamed/permission-denied
    // mid-pick) — this is the one step here that touches disk I/O rather
    // than pure text-in-memory.
    return { ok: false, error: { code: 'readFailed' } };
  }
  return parseFittingXmlText(text);
}
