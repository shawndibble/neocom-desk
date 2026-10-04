import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { suggestPayeeForSystem } from './suggestPayee';

const AINSAN = 30001;
const TALIDAL = 30002;

function payee(id: string, name: string, overrides: Partial<PayeeRecord> = {}): PayeeRecord {
  return { id, characterId: 1, name, defaultTaxPct: 5, updatedAt: 0, ...overrides };
}

function assigned(
  payeeId: string | undefined,
  date: string,
  solarSystemId = AINSAN,
  overrides: Partial<MiningTaxAssignmentRecord> = {}
): MiningTaxAssignmentRecord {
  return {
    id: `${payeeId}-${date}-${solarSystemId}`,
    characterId: 1,
    date,
    solarSystemId,
    payeeId,
    oreLines: [],
    taxPct: 5,
    estimatedValue: 0,
    taxOwed: 0,
    status: 'paid',
    updatedAt: 0,
    ...overrides,
  };
}

const starTail = payee('st', 'Star Tail Industries');
const ion = payee('ion', 'Ion Strider', { defaultTaxPct: 8 });
const bureau = payee('bu', 'Bureau of Unified Harvesting');
const guns = payee('gu', 'Guns-R-Us Holdings');
const payees = [starTail, ion, bureau, guns];

describe('suggestPayeeForSystem', () => {
  it('suggests the Payee last used in the system, by mined date', () => {
    const result = suggestPayeeForSystem(
      [
        assigned('bu', '2026-09-27'),
        assigned('ion', '2026-09-30'),
        assigned('st', '2026-09-12'),
        assigned('st', '2026-09-10'),
      ],
      payees,
      AINSAN
    );
    expect(result.suggested?.id).toBe('ion');
  });

  it('ranks the rest by how often they were used in that system, then by name', () => {
    const result = suggestPayeeForSystem(
      [
        assigned('ion', '2026-09-30'),
        assigned('st', '2026-09-12'),
        assigned('st', '2026-09-10'),
        assigned('bu', '2026-09-27'),
        assigned('gu', '2026-09-08', TALIDAL),
      ],
      payees,
      AINSAN
    );
    expect(result.ranked.map((p) => p.id)).toEqual(['ion', 'st', 'bu', 'gu']);
  });

  it('ignores dismissals and other systems when picking the suggestion', () => {
    const result = suggestPayeeForSystem(
      [
        assigned(undefined, '2026-10-01', AINSAN, { status: 'dismissed' }),
        assigned('gu', '2026-10-02', TALIDAL),
        assigned('st', '2026-09-01'),
      ],
      payees,
      AINSAN
    );
    expect(result.suggested?.id).toBe('st');
  });

  it('skips a Payee that no longer exists', () => {
    const result = suggestPayeeForSystem(
      [assigned('gone', '2026-10-02'), assigned('bu', '2026-09-01')],
      payees,
      AINSAN
    );
    expect(result.suggested?.id).toBe('bu');
  });

  it('falls back to a Payee remembered for the system when nothing was assigned there yet', () => {
    const remembered = payee('pl', 'Plenitude Highsec Police', { systemId: TALIDAL });
    const result = suggestPayeeForSystem([], [...payees, remembered], TALIDAL);
    expect(result.suggested?.id).toBe('pl');
    expect(result.ranked[0].id).toBe('pl');
  });

  it('suggests nothing for a system with no history and no remembered Payee', () => {
    const result = suggestPayeeForSystem([assigned('st', '2026-09-01')], payees, TALIDAL);
    expect(result.suggested).toBeUndefined();
    expect(result.ranked.map((p) => p.name)).toEqual([
      'Bureau of Unified Harvesting',
      'Guns-R-Us Holdings',
      'Ion Strider',
      'Star Tail Industries',
    ]);
  });

  it('lists the systems each Payee has been used in', () => {
    const result = suggestPayeeForSystem(
      [assigned('st', '2026-09-01'), assigned('st', '2026-09-02', TALIDAL)],
      payees,
      AINSAN
    );
    expect([...(result.systemsByPayee.get('st') ?? [])].sort()).toEqual([AINSAN, TALIDAL]);
  });
});
