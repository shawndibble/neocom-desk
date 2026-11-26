/// <reference lib="webworker" />
import { writeWorkbook, type PlainSheet } from './xlsx';

export interface XlsxRequest {
  id: number;
  sheets: PlainSheet[];
}

export type XlsxReply = { id: number; bytes: Uint8Array } | { id: number; error: string };

export function answerXlsxRequest({ id, sheets }: XlsxRequest): XlsxReply {
  try {
    return { id, bytes: writeWorkbook(sheets) };
  } catch (error) {
    return { id, error: error instanceof Error ? error.message : String(error) };
  }
}

if (typeof WorkerGlobalScope !== 'undefined') {
  self.onmessage = (event: MessageEvent<XlsxRequest>) => {
    const reply = answerXlsxRequest(event.data);
    if ('bytes' in reply) self.postMessage(reply, [reply.bytes.buffer as ArrayBuffer]);
    else self.postMessage(reply);
  };
}
