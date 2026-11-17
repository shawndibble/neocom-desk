import { describe, expect, it } from 'vitest';
import { parseSetRefineryArchiveInput } from './corpTaxBookRefineryArchive.js';

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
