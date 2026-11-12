import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { moonOwnerNote } from './moonOwnerNote';

const NOW = Date.UTC(2026, 10, 12, 7, 10);
const t = i18n.getFixedT('en');
const row = (over: Partial<MoonOwnerRow> = {}): MoonOwnerRow => ({
  id: '5',
  corporationId: 5,
  status: 'active',
  refineryCount: 1,
  mined: 0,
  owed: 0,
  balance: { kind: 'none', isk: 0 },
  mode: 'normal',
  lastReadWellAt: new Date(NOW - 2 * 3_600_000).toISOString(),
  ...over,
});

describe('moonOwnerNote', () => {
  it('says when a read moon owner is read next, in EVE time', () => {
    expect(moonOwnerNote(row(), NOW, t)).toBe(
      '1 refinery · Synced 2h ago · next read 12:35\u00a0UTC'
    );
  });

  it('gives a moon owner nothing was seen at yet its next read too', () => {
    expect(moonOwnerNote(row({ nothingSeen: true, refineryCount: 0 }), NOW, t)).toBe(
      'No mining or extraction seen yet · Synced 2h ago · next read 12:35\u00a0UTC'
    );
  });

  it('a moon owner that is never read again has no next read', () => {
    for (const status of ['disconnected', 'left', 'removed'] as const) {
      expect(moonOwnerNote(row({ status }), NOW, t)).not.toMatch(/next read/);
    }
  });
});
