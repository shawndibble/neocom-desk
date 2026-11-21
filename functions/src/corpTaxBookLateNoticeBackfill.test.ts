import { describe, expect, it } from 'vitest';
import { planLateNoticeCopies, planPaymentReaders } from './corpTaxBookLateNoticeBackfill.js';

const notice = (id: string, kind?: string, mail: Record<string, unknown> = {}) => ({
  id,
  minerId: 'solo:5',
  ...(kind ? { kind } : {}),
  issuedAt: '2026-11-01T00:00:00.000Z',
  lines: [
    { kind: 'mined', date: '2026-10-05', chargeKey: 'k', oreLines: [], estimatedValue: 1, tax: 9 },
  ],
  uids: ['char:5'],
  ...mail,
});
const quiet = { sent: 0, manualSent: 0, remindersStopped: false };

describe('planLateNoticeCopies', () => {
  it('copies each legacy notice and each link that has no copy yet', () => {
    const plan = planLateNoticeCopies(
      [
        { id: 'n1', data: notice('n1', 'notice') },
        { id: 'n2', data: notice('n2', 'notice') },
      ],
      [
        { id: 'n1', data: { verifyToken: 't1' } },
        { id: 'n2', data: { verifyToken: 't2' } },
      ],
      { notices: new Map([['n2', quiet]]), links: new Set(['n2']) }
    );
    expect(plan.notices.map((n) => [n.id, n.listed, n.uids])).toEqual([['n1', 9, ['char:5']]]);
    expect(plan.links).toEqual([{ id: 'n1', token: 't1' }]);
    expect(plan.mail).toEqual([]);
  });

  it('brings a copy’s mail state level with its legacy doc', () => {
    const plan = planLateNoticeCopies(
      [{ id: 'n1', data: notice('n1', 'notice', { mailsSent: 2, remindersStopped: true }) }],
      [],
      { notices: new Map([['n1', { ...quiet, sent: 1, manualSent: 1 }]]), links: new Set() }
    );
    expect(plan.mail).toEqual([
      { id: 'n1', mail: { sent: 2, manualSent: 1, remindersStopped: true } },
    ]);
  });

  it('leaves a calendar Statement and a link with no token alone', () => {
    const plan = planLateNoticeCopies(
      [{ id: 's1', data: notice('s1') }],
      [{ id: 's1', data: {} }],
      {
        notices: new Map(),
        links: new Set(),
      }
    );
    expect(plan).toEqual({ notices: [], links: [], mail: [] });
  });

  it('plans nothing on a re-run', () => {
    const statements = [{ id: 'n1', data: notice('n1', 'notice') }];
    const links = [{ id: 'n1', data: { verifyToken: 't1' } }];
    expect(
      planLateNoticeCopies(statements, links, {
        notices: new Map([['n1', quiet]]),
        links: new Set(['n1']),
      })
    ).toEqual({ notices: [], links: [], mail: [] });
  });
});

describe('planPaymentReaders', () => {
  const miners = [{ id: 'g', data: { characterIds: [1, 2, 3], officerClaimed: [3] } }];

  it("gives each payment stored without `uids` its Miner's readers and its sender", () => {
    expect(
      planPaymentReaders(
        [
          { id: 'p1', data: { minerId: 'g', uid: 'char:2' } },
          { id: 'p2', data: { minerId: 'solo:7', uid: 'char:7' } },
          { id: 'p3', data: { uid: 'char:9' } },
          { id: 'p4', data: { minerId: 'g', uid: 'char:3' } },
        ],
        miners
      )
    ).toEqual([
      { id: 'p1', uids: ['char:1', 'char:2'] },
      { id: 'p2', uids: ['char:7'] },
      { id: 'p3', uids: ['char:9'] },
      { id: 'p4', uids: ['char:1', 'char:2', 'char:3'] },
    ]);
  });

  it('leaves a payment that has `uids` alone, so a re-run plans nothing', () => {
    expect(
      planPaymentReaders([{ id: 'p1', data: { minerId: 'g', uid: 'char:2', uids: [] } }], miners)
    ).toEqual([]);
  });
});
