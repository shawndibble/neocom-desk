import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadCsv } from './downloadCsv';
import * as download from './download';

interface Row {
  name: string;
}
const columns = [{ header: 'Name', value: (r: Row) => r.name }];

afterEach(() => vi.restoreAllMocks());

describe('downloadCsv', () => {
  it('names the file from the surface and the injected date', () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    downloadCsv('build-materials', [{ name: 'Tritanium' }], columns, new Date(2026, 7, 5));
    expect(spy.mock.calls[0][0]).toBe('neocom-build-materials-2026-08-05.csv');
  });

  it('passes the serialized CSV through, BOM and all', () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    downloadCsv('skills', [{ name: 'Frigate' }], columns, new Date(2026, 0, 1));
    const text = spy.mock.calls[0][1];
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('Frigate');
  });
});
