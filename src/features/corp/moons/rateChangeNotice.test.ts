import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { agreedRateChange, mailRateChange, SEND_MAIL_SCOPE } from './rateChangeNotice';

const records: Record<number, { ceo_id: number }> = { 10: { ceo_id: 501 }, 20: { ceo_id: 502 } };
vi.mock('@/features/character/publicInfoData', () => ({
  loadPublicCorporationRecord: async (id: number) => records[id] ?? null,
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: async (ids: number[]) => new Map(ids.map((id) => [id, `Pilot ${id}`])),
}));

const change = { date: '2026-10-01', oldPct: 5, newPct: 8, requestedPct: 6 };
const base = {
  characterId: 1,
  corporationId: 5,
  accountingCorporationName: 'B-UH Moons',
  feederCorporationId: 10,
  change,
};

describe('mailRateChange', () => {
  beforeEach(async () => {
    await db.corpMailQueue.clear();
  });

  it('queues one short mail each for the CEO and a character payee', async () => {
    await mailRateChange({
      ...base,
      grantedScopes: [SEND_MAIL_SCOPE],
      payee: { kind: 'character', id: 700 },
    });
    const rows = await db.corpMailQueue.toArray();
    expect(rows.map((r) => r.recipientId).sort()).toEqual([501, 700]);
    for (const r of rows) {
      expect(r.kind).toBe('rate-change');
      expect(r.senderCharacterId).toBe(1);
      expect(r.body).toContain('8%');
      expect(r.body).toContain('You asked for 6%');
      expect(`${r.subject} ${r.body}`).not.toMatch(/miner|margin|feeder|collector/i);
    }
  });

  it('reaches a corporation payee through its CEO', async () => {
    await mailRateChange({
      ...base,
      grantedScopes: [SEND_MAIL_SCOPE],
      payee: { kind: 'corporation', id: 20 },
    });
    expect((await db.corpMailQueue.toArray()).map((r) => r.recipientId).sort()).toEqual([501, 502]);
  });

  it('queues nothing without the mail permission', async () => {
    await mailRateChange({ ...base, grantedScopes: ['esi-skills.read_skills.v1'] });
    await mailRateChange({ ...base, grantedScopes: undefined });
    expect(await db.corpMailQueue.count()).toBe(0);
  });

  it('does not queue the same change twice', async () => {
    const input = { ...base, grantedScopes: [SEND_MAIL_SCOPE] };
    await mailRateChange(input);
    await mailRateChange(input);
    expect(await db.corpMailQueue.count()).toBe(1);
  });
});

describe('agreedRateChange', () => {
  const at = new Date('2026-10-05T12:00:00Z');
  const req = {
    kind: 'requested' as const,
    pct: 6,
    effectiveFrom: '2026-10-01',
    recordedAt: '2026-10-01T00:00:00Z',
  };
  it('is the change an override makes, with what was asked', () => {
    expect(agreedRateChange([req], 8, at)).toEqual({
      date: '2026-10-05',
      oldPct: 6,
      newPct: 8,
      requestedPct: 6,
      recordedAt: at.toISOString(),
    });
  });
  it('is undefined when the agreed rate equals the rate already in force', () => {
    expect(agreedRateChange([req], 6, at)).toBeUndefined();
  });
});
