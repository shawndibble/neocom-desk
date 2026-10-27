import { describe, expect, it } from 'vitest';
import { MAX_SCAN_TEXT, rejectScanText, ScanRejected, scanFailure } from './scanResult';

const ROW = 'Veldspar\t100\t10 m3\t1.00 ISK\t20 km';

describe('rejectScanText', () => {
  it('lets a scan through', () => {
    expect(rejectScanText(ROW)).toBeNull();
  });

  it('refuses text that is not a scan, and a scan over the size cap', () => {
    expect(rejectScanText('Tritanium\t100')).toBe('not-a-scan');
    const big = Array.from({ length: Math.ceil(MAX_SCAN_TEXT / 20) }, () => ROW).join('\n');
    expect(rejectScanText(big)).toBe('too-large');
  });
});

describe('scanFailure', () => {
  it('reads a rejection by its reason', () => {
    expect(scanFailure(new ScanRejected('too-large'))).toBe('too-large');
  });

  it('says the server refused when Firestore answers permission-denied', () => {
    expect(scanFailure(Object.assign(new Error('denied'), { code: 'permission-denied' }))).toBe(
      'refused'
    );
  });

  it('is a plain failure for anything else', () => {
    expect(scanFailure(new Error('offline'))).toBe('failed');
    expect(scanFailure('nope')).toBe('failed');
  });
});
