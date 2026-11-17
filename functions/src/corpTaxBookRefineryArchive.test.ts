import { describe, expect, it } from 'vitest';
import { archiveNeedsWrite, parseSetRefineryArchiveInput } from './corpTaxBookRefineryArchive.js';

describe('archiveNeedsWrite', () => {
  const day = Date.UTC(2026, 10, 1, 12);
  const stored = { at: day, by: 1, reason: 'idle' as const };
  it('writes an archive or restore that changes the state', () => {
    expect(archiveNeedsWrite(undefined, true, day)).toBe(true);
    expect(archiveNeedsWrite(stored, false, day)).toBe(true);
  });
  it('skips a restore of nothing and a second archive the same UTC day', () => {
    expect(archiveNeedsWrite(undefined, false, day)).toBe(false);
    expect(archiveNeedsWrite(stored, true, Date.UTC(2026, 10, 1, 23, 59))).toBe(false);
  });
  it('re-archives an entry from an earlier day: mining since may have brought it back', () => {
    expect(archiveNeedsWrite(stored, true, Date.UTC(2026, 10, 2))).toBe(true);
  });
});

describe('parseSetRefineryArchiveInput', () => {
  const base = { corporationId: 9, accessToken: 't', feederCorporationId: 5, structureId: 4001 };
  it('reads an archive with its reason, and a restore', () => {
    expect(parseSetRefineryArchiveInput({ ...base, archived: true, reason: 'gone' })).toMatchObject(
      { feederCorporationId: 5, structureId: 4001, archived: true, reason: 'gone' }
    );
    expect(parseSetRefineryArchiveInput({ ...base, archived: false }).archived).toBe(false);
  });
  it('defaults the reason to manual', () => {
    expect(parseSetRefineryArchiveInput({ ...base, archived: true }).reason).toBe('manual');
  });
  it('rejects a bad structure id, a non-boolean and an unknown reason', () => {
    expect(() =>
      parseSetRefineryArchiveInput({ ...base, structureId: '1', archived: true })
    ).toThrow();
    expect(() => parseSetRefineryArchiveInput({ ...base, archived: 'yes' })).toThrow();
    expect(() =>
      parseSetRefineryArchiveInput({ ...base, archived: true, reason: 'bored' })
    ).toThrow();
  });
});
