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
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 10 * 1024 * 1024;

function containsDoctype(text: string): boolean {
  return /<!DOCTYPE/i.test(text);
}

async function decompressGzipCapped(bytes: Uint8Array): Promise<string> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
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
      ...(skillID !== undefined && Number.isFinite(skillID) ? { skillID } : {}),
      ...(priority !== undefined && Number.isFinite(priority) ? { priority } : {}),
    });
  }
  return entries;
}

export async function parsePlanXmlFile(file: File): Promise<PlanXmlDocumentResult> {
  if (file.size > MAX_COMPRESSED_BYTES) {
    return { ok: false, error: { code: 'tooLarge' } };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
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
