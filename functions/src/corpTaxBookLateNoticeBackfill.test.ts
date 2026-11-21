import { describe, expect, it } from 'vitest';
import { planLateNoticeCopies } from './corpTaxBookLateNoticeBackfill.js';

const notice = (id: string, kind?: string) => ({
  id,
  minerId: 'solo:5',
  ...(kind ? { kind } : {}),
  issuedAt: '2026-11-01T00:00:00.000Z',
  lines: [
    { kind: 'mined', date: '2026-10-05', chargeKey: 'k', oreLines: [], estimatedValue: 1, tax: 9 },
  ],
  uids: ['char:5'],
});

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
      { notices: new Set(['n2']), links: new Set(['n2']) }
    );
    expect(plan.notices.map((n) => [n.id, n.listed, n.uids])).toEqual([['n1', 9, ['char:5']]]);
    expect(plan.links).toEqual([{ id: 'n1', token: 't1' }]);
  });

  it('leaves a calendar Statement and a link with no token alone', () => {
    const plan = planLateNoticeCopies(
      [{ id: 's1', data: notice('s1') }],
      [{ id: 's1', data: {} }],
      { notices: new Set(), links: new Set() }
    );
    expect(plan).toEqual({ notices: [], links: [] });
  });

  it('plans nothing on a re-run', () => {
    const statements = [{ id: 'n1', data: notice('n1', 'notice') }];
    const links = [{ id: 'n1', data: { verifyToken: 't1' } }];
    expect(
      planLateNoticeCopies(statements, links, { notices: new Set(['n1']), links: new Set(['n1']) })
    ).toEqual({ notices: [], links: [] });
  });
});
