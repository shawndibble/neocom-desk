import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { CsvColumn } from './csv';
import { toXlsxWorkbook, type AnyXlsxSheet } from './xlsx';
import { answerXlsxRequest, type XlsxRequest } from './xlsx.worker';

interface Row {
  name: string;
  qty: number | null;
  at?: string;
}

const suffix = '!';
const columns: CsvColumn<Row>[] = [
  // A closure over page state: it can only run where the rows are.
  { header: 'Name', value: (r) => r.name + suffix },
  { header: 'Qty', value: (r) => r.qty },
  { header: 'Issued', value: (r) => r.at },
];

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Row <${i}> & "co"`,
    qty: i % 3 === 0 ? null : i * 1.5,
    at: i % 2 ? '2026-01-01T12:00:00Z' : undefined,
  }));

const sheets = (n = 3): AnyXlsxSheet[] => [
  { name: 'Orders', rows: rows(n), columns },
  { name: 'Orders', rows: [], columns },
];

/** Each zip entry's text: the zip's own timestamps differ from build to build, the content never. */
const entries = (bytes: Uint8Array) =>
  Object.fromEntries(
    Object.entries(unzipSync(bytes)).map(([path, data]) => [path, strFromU8(data)])
  );

/** A Worker that answers like `xlsx.worker.ts`, after a structured clone as postMessage makes. */
class FakeWorker {
  static requests: XlsxRequest[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage(message: XlsxRequest) {
    const request = structuredClone(message);
    FakeWorker.requests.push(request);
    setTimeout(() => this.onmessage?.({ data: answerXlsxRequest(request) } as MessageEvent));
  }
  terminate() {}
}

/** A worker whose writer threw: it answers with the error. */
class FailingWorker extends FakeWorker {
  postMessage(message: XlsxRequest) {
    setTimeout(() =>
      this.onmessage?.({ data: { id: message.id, error: 'disk full' } } as MessageEvent)
    );
  }
}

class BrokenWorker {
  constructor() {
    throw new Error('no module workers here');
  }
}

/** A fresh module each time: the worker client remembers a failure for the page's lifetime. */
const freshBuild = async () => (await import('./xlsxBuild')).buildWorkbook;

beforeEach(() => {
  vi.resetModules();
  FakeWorker.requests = [];
});
afterEach(() => vi.unstubAllGlobals());

describe('buildWorkbook', () => {
  it('builds in the worker from plain cells, the same workbook as the page build', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const built = await (await freshBuild())(sheets());
    expect(FakeWorker.requests).toHaveLength(1);
    expect(FakeWorker.requests[0].sheets[0]).toEqual({
      name: 'Orders',
      headers: ['Name', 'Qty', 'Issued'],
      rows: [
        ['Row <0> & "co"!', null, undefined],
        ['Row <1> & "co"!', 1.5, '2026-01-01T12:00:00Z'],
        ['Row <2> & "co"!', 3, undefined],
      ],
    });
    expect(entries(built)).toEqual(entries(toXlsxWorkbook(sheets())));
  });

  it('builds on the page where there is no Worker, the same workbook', async () => {
    vi.stubGlobal('Worker', undefined);
    const built = await (await freshBuild())(sheets());
    expect(entries(built)).toEqual(entries(toXlsxWorkbook(sheets())));
  });

  it('builds on the page when the worker cannot start', async () => {
    vi.stubGlobal('Worker', BrokenWorker);
    const built = await (await freshBuild())(sheets());
    expect(entries(built)).toEqual(entries(toXlsxWorkbook(sheets())));
  });

  it("rejects with the worker's own build error rather than building twice", async () => {
    vi.stubGlobal('Worker', FailingWorker);
    await expect((await freshBuild())(sheets())).rejects.toThrow('disk full');
  });

  it('reads a large sheet in slices, every row in order', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { ROWS_PER_SLICE, buildWorkbook } = await import('./xlsxBuild');
    const big = sheets(ROWS_PER_SLICE * 2 + 7);
    await buildWorkbook(big);
    const sent = FakeWorker.requests[0].sheets[0].rows;
    expect(sent).toHaveLength(ROWS_PER_SLICE * 2 + 7);
    expect(sent[ROWS_PER_SLICE * 2 + 6][0]).toBe(`Row <${ROWS_PER_SLICE * 2 + 6}> & "co"!`);
  });
});
