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

  it('never doubles the BOM — downloadCsv adds no BOM of its own on top of toCsv', () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    downloadCsv('skills', [{ name: 'Frigate' }], columns, new Date(2026, 0, 1));
    const text = spy.mock.calls[0][1];
    expect(text.match(new RegExp('\u{FEFF}', 'gu'))).toHaveLength(1);
  });

  it('appends -partial to the filename when truncated is true', () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    downloadCsv('assets', [{ name: 'Tritanium' }], columns, new Date(2026, 7, 5), true);
    expect(spy.mock.calls[0][0]).toBe('neocom-assets-2026-08-05-partial.csv');
  });

  it('omits -partial when truncated is false or omitted', () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    downloadCsv('assets', [{ name: 'Tritanium' }], columns, new Date(2026, 7, 5));
    expect(spy.mock.calls[0][0]).toBe('neocom-assets-2026-08-05.csv');
  });

  it('folds a qualifier into the filename, slugified, so per-division corp exports never collide', () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    downloadCsv(
      'corp-wallet-journal',
      [{ name: 'Tritanium' }],
      columns,
      new Date(2026, 7, 5),
      false,
      'SRP Division'
    );
    expect(spy.mock.calls[0][0]).toBe('neocom-corp-wallet-journal-srp-division-2026-08-05.csv');
  });

  it('omits the qualifier segment entirely when none is given', () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    downloadCsv('corp-wallet-journal', [{ name: 'Tritanium' }], columns, new Date(2026, 7, 5));
    expect(spy.mock.calls[0][0]).toBe('neocom-corp-wallet-journal-2026-08-05.csv');
  });
});
