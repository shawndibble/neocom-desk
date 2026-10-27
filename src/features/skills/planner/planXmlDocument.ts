/**
 * Turn a raw plan file (`.emp` = gzip, or plain `.xml`) into the plain,
 * engine-safe `PlanXmlDocument` intermediate object skillPlanXml consumes.
 * This is the only module that touches DOMParser/gzip — a `Document` never
 * crosses into src/engine, only this module's plain output does.
 */
import type { PlanXmlDocument, PlanXmlEntryInput } from '@/engine/import/skillPlanXml';

export type PlanXmlDocumentErrorCode =
  | 'tooLarge'
  | 'readFailed'
  | 'decompressFailed'
  | 'unsupportedFormat'
  | 'browserUnsupported'
  | 'malformedXml'
  | 'multiPlanUnsupported';

export interface PlanXmlDocumentError {
  code: PlanXmlDocumentErrorCode;
}

export type PlanXmlDocumentResult =
  { ok: true; document: PlanXmlDocument } | { ok: false; error: PlanXmlDocumentError };

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;
// A plan is tiny XML even with thousands of entries; these caps only exist
// to reject a malicious/corrupt file cheaply, not to accommodate real plans.
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 10 * 1024 * 1024;

/** Legitimate exports never carry a DOCTYPE — rejecting it removes XXE/entity-expansion as a concern before DOMParser ever sees the text. */
function containsDoctype(text: string): boolean {
  return /<!DOCTYPE/i.test(text);
}

async function decompressGzipCapped(bytes: Uint8Array): Promise<string> {
  // Built directly from the bytes rather than via Blob.stream(): jsdom's Blob
  // (the test environment's DOM implementation) has no .stream() method,
  // unlike a real browser's — ReadableStream itself is a platform global both
  // provide, so this path works identically in tests and in the browser.
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  // lib.dom types DecompressionStream's writable as WritableStream<BufferSource>,
  // which pipeThrough's generic can't unify with our ReadableStream<Uint8Array>
  // even though Uint8Array is a valid BufferSource at runtime — cast the pair.
  const stream = source.pipeThrough(
    new DecompressionStream('gzip') as ReadableWritablePair<Uint8Array, Uint8Array>
  );
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DECOMPRESSED_BYTES) {
      await reader.cancel();
      throw new Error('decompressed size exceeds cap');
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(combined);
}

function readEntries(planEl: Element): PlanXmlEntryInput[] {
  const entries: PlanXmlEntryInput[] = [];
  for (const el of Array.from(planEl.getElementsByTagName('entry'))) {
    const skillName = el.getAttribute('skill');
    const levelAttr = el.getAttribute('level');
    if (!skillName || levelAttr === null) continue;
    const skillIDAttr = el.getAttribute('skillID');
    const priorityAttr = el.getAttribute('priority');
    const skillID = skillIDAttr ? Number(skillIDAttr) : undefined;
    const priority = priorityAttr ? Number(priorityAttr) : undefined;
    entries.push({
      skillName,
      level: Number(levelAttr),
      // A malformed attribute (Number(...) -> NaN) is treated as absent
      // rather than propagated — same "unknown gracefully becomes optional"
      // stance as an entry missing the attribute entirely.
      ...(skillID !== undefined && Number.isFinite(skillID) ? { skillID } : {}),
      ...(priority !== undefined && Number.isFinite(priority) ? { priority } : {}),
    });
  }
  return entries;
}

/**
 * Parse a raw plan file's bytes. `file` may be gzip (`.emp`) or plain
 * (`.xml`) — detected by content (gzip magic bytes), not filename, since a
 * user might rename either. Never throws: every failure mode returns
 * `{ ok: false, error }` for the caller to translate into a UI message.
 */
export async function parsePlanXmlFile(file: File): Promise<PlanXmlDocumentResult> {
  if (file.size > MAX_COMPRESSED_BYTES) {
    return { ok: false, error: { code: 'tooLarge' } };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    // A File handle can reject on read (removed/renamed/permission-denied
    // mid-pick) — this is the one step in the pipeline that touches disk
    // I/O rather than pure bytes-in-memory, so it's the one guarded here.
    return { ok: false, error: { code: 'readFailed' } };
  }
  const isGzip = bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;

  let text: string;
  if (isGzip) {
    if (typeof DecompressionStream !== 'function') {
      return { ok: false, error: { code: 'browserUnsupported' } };
    }
    try {
      text = await decompressGzipCapped(bytes);
    } catch {
      return { ok: false, error: { code: 'decompressFailed' } };
    }
  } else {
    text = new TextDecoder('utf-8').decode(bytes);
  }

  if (containsDoctype(text)) {
    return { ok: false, error: { code: 'unsupportedFormat' } };
  }

  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { ok: false, error: { code: 'malformedXml' } };
  }

  const root = doc.documentElement;
  if (root.nodeName === 'plans') {
    return { ok: false, error: { code: 'multiPlanUnsupported' } };
  }
  if (root.nodeName !== 'plan') {
    return { ok: false, error: { code: 'unsupportedFormat' } };
  }

  return {
    ok: true,
    document: { name: root.getAttribute('name') ?? undefined, entries: readEntries(root) },
  };
}
