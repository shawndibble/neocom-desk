import { describe, it, expect } from 'vitest';
import { selectUnseenEntries, type ChangelogEntry } from './whatsNew';

const changelog: ChangelogEntry[] = [
  { version: '0.3.0', date: '2026-03-01', items: ['Third thing'] },
  { version: '0.2.0', date: '2026-02-01', items: ['Second thing'] },
  { version: '0.1.0', date: '2026-01-01', items: ['First thing'] },
];

describe('selectUnseenEntries', () => {
  it('shows nothing on a fresh install (no prior version recorded)', () => {
    expect(selectUnseenEntries(changelog, null, '0.3.0')).toEqual([]);
  });

  it('shows nothing when the last seen version matches the current version', () => {
    expect(selectUnseenEntries(changelog, '0.3.0', '0.3.0')).toEqual([]);
  });

  it('shows every entry newer than the last seen version, newest first', () => {
    expect(selectUnseenEntries(changelog, '0.1.0', '0.3.0')).toEqual([changelog[0], changelog[1]]);
  });

  it('shows only the entry directly after the last seen version', () => {
    expect(selectUnseenEntries(changelog, '0.2.0', '0.3.0')).toEqual([changelog[0]]);
  });

  it('falls back to just the current entry when the last seen version is unrecognized', () => {
    expect(selectUnseenEntries(changelog, '0.0.9-unreleased', '0.3.0')).toEqual([changelog[0]]);
  });

  it('returns nothing when the current version has no changelog entry and the last seen version is unrecognized', () => {
    expect(selectUnseenEntries(changelog, '0.0.9-unreleased', '9.9.9')).toEqual([]);
  });
});
