/// <reference lib="webworker" />
/** `writeWorkbook` off the main thread for `xlsxBuild`: a big export's XML and zip take seconds. */
import { writeWorkbook, type PlainSheet } from './xlsx';

export interface XlsxRequest {
  id: number;
  sheets: PlainSheet[];
}

export type XlsxReply = { id: number; bytes: Uint8Array } | { id: number; error: string };

/** Every request gets a reply, so the page never waits on a build that threw. */
export function answerXlsxRequest({ id, sheets }: XlsxRequest): XlsxReply {
  try {
    return { id, bytes: writeWorkbook(sheets) };
  } catch (error) {
    return { id, error: error instanceof Error ? error.message : String(error) };
  }
}

// Only in a worker: the module is also imported by tests, where there is no `self` to listen on.
if (typeof WorkerGlobalScope !== 'undefined') {
  self.onmessage = (event: MessageEvent<XlsxRequest>) => {
    const reply = answerXlsxRequest(event.data);
    if ('bytes' in reply) self.postMessage(reply, [reply.bytes.buffer as ArrayBuffer]);
    else self.postMessage(reply);
  };
}
