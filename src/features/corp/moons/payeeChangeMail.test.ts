import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { mailPayeeChange } from './payeeChangeMail';
import { SEND_MAIL_SCOPE } from './rateChangeNotice';

vi.mock('@/features/character/names', () => ({
  resolveNames: async (ids: number[]) => new Map(ids.map((id) => [id, `Pilot ${id}`])),
}));

const base = {
  characterId: 1,
  corporationId: 5,
  feederCorporationId: 10,
  changedByName: 'B-UH Moons',
  moonOwnerName: 'Rock Holders',
  payeeName: 'Kara Vex',
  recipients: [501, 700],
  now: new Date('2026-10-21T12:00:00Z'),
};

describe('mailPayeeChange', () => {
  beforeEach(async () => {
    await db.corpMailQueue.clear();
  });

  it('queues one short mail for exactly each recipient the server named', async () => {
    await mailPayeeChange({ ...base, grantedScopes: [SEND_MAIL_SCOPE] });
    const rows = await db.corpMailQueue.toArray();
    expect(rows.map((r) => r.recipientId).sort()).toEqual([501, 700]);
    for (const r of rows) {
      expect(r.kind).toBe('payee-change');
      expect(r.senderCharacterId).toBe(1);
      expect(r.corporationId).toBe(5);
      expect(r.body).toContain(`Hi ${r.recipientName},`);
      expect(r.body).toContain('now go to Kara Vex');
      expect(`${r.subject} ${r.body}`).not.toMatch(
        /%|rate|margin|miner|hour|48|remov|feeder|collector/i
      );
    }
  });

  it('queues nothing without the mail permission or anyone to tell', async () => {
    await mailPayeeChange({ ...base, grantedScopes: ['esi-skills.read_skills.v1'] });
    await mailPayeeChange({ ...base, grantedScopes: undefined });
    await mailPayeeChange({ ...base, grantedScopes: [SEND_MAIL_SCOPE], recipients: [] });
    expect(await db.corpMailQueue.count()).toBe(0);
  });

  it('never throws into the change', async () => {
    await expect(
      mailPayeeChange({ ...base, grantedScopes: [SEND_MAIL_SCOPE], now: new Date(NaN) })
    ).resolves.toBeUndefined();
  });
});
