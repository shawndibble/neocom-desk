import { describe, expect, it } from 'vitest';
import {
  defaultPayeeForSystem,
  defaultOptOutKey,
  isDefaultAssigned,
  planDefaultAssign,
  type DefaultSystemPayee,
} from './defaultSystems';
import type { MiningLedgerEntry } from './types';

const SYSTEM = 30000142;
const OTHER = 30002187;
const BITUMENS = 45492;

const payee = (overrides: Partial<DefaultSystemPayee> = {}): DefaultSystemPayee => ({
  id: 'p1',
  characterId: 1,
  defaultSystems: [{ systemId: SYSTEM, from: '2026-10-20' }],
  ...overrides,
});

const entry = (overrides: Partial<MiningLedgerEntry> = {}): MiningLedgerEntry => ({
  characterId: 1,
  date: '2026-10-21',
  solarSystemId: SYSTEM,
  oreLines: [{ typeId: BITUMENS, quantity: 100 }],
  ...overrides,
});

const covering = (overrides = {}) => ({
  characterId: 1,
  date: '2026-10-21',
  solarSystemId: SYSTEM,
  ...overrides,
});

describe('planDefaultAssign', () => {
  it('assigns the whole entry in a Default System to that Payee', () => {
    const slices = planDefaultAssign([entry()], [], [payee()], new Set());
    expect(slices).toEqual([
      {
        payeeId: 'p1',
        characterId: 1,
        date: '2026-10-21',
        solarSystemId: SYSTEM,
        oreLines: [{ typeId: BITUMENS, quantity: 100 }],
        entryOreLines: [{ typeId: BITUMENS, quantity: 100 }],
      },
    ]);
  });

  it('leaves a system no Payee defaults', () => {
    expect(planDefaultAssign([entry({ solarSystemId: OTHER })], [], [payee()], new Set())).toEqual(
      []
    );
  });

  it('is forward-only: nothing before the day the system was added', () => {
    const early = entry({ date: '2026-10-19' });
    expect(planDefaultAssign([early], [], [payee()], new Set())).toEqual([]);
    const sameDay = entry({ date: '2026-10-20' });
    expect(planDefaultAssign([sameDay], [], [payee()], new Set())).toHaveLength(1);
  });

  it('never touches an entry any Assignment already covers', () => {
    expect(planDefaultAssign([entry()], [covering()], [payee()], new Set())).toEqual([]);
  });

  it('does not re-assign an entry the pilot unassigned', () => {
    const optedOut = new Set([defaultOptOutKey(1, '2026-10-21', SYSTEM)]);
    expect(planDefaultAssign([entry()], [], [payee()], optedOut)).toEqual([]);
  });

  it("only uses the Character's own Payees", () => {
    expect(planDefaultAssign([entry()], [], [payee({ characterId: 2 })], new Set())).toEqual([]);
  });

  it('picks one Payee deterministically if two hold a system', () => {
    const slices = planDefaultAssign(
      [entry()],
      [],
      [payee({ id: 'b' }), payee({ id: 'a' })],
      new Set()
    );
    expect(slices.map((s) => s.payeeId)).toEqual(['a']);
  });
});

describe('defaultPayeeForSystem', () => {
  it('finds the Payee holding a system, ignoring other Characters', () => {
    const payees = [payee({ id: 'x', characterId: 2 }), payee({ id: 'y' })];
    expect(defaultPayeeForSystem(payees, 1, SYSTEM)?.id).toBe('y');
    expect(defaultPayeeForSystem(payees, 1, OTHER)).toBeUndefined();
  });
});

describe('isDefaultAssigned', () => {
  it('is true only for override === false; a stored row without the flag is a pilot act', () => {
    expect(isDefaultAssigned({ override: false })).toBe(true);
    expect(isDefaultAssigned({ override: true })).toBe(false);
    expect(isDefaultAssigned({})).toBe(false);
  });
});
