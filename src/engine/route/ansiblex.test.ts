import { describe, expect, it } from 'vitest';
import { findJumpRoute, routeCost, type JumpGraph } from './jumpRoute';
import {
  ANSIBLEX_SEARCH,
  ANSIBLEX_TYPE_ID,
  bridgeBetween,
  bridgeConnections,
  foundGate,
  parseAnsiblexName,
  parseGateList,
  type AnsiblexGate,
  type SystemLookup,
} from './ansiblex';

/**
 *   A ─ B ─ C ─ D ─ E        the gate way, four jumps
 *   A ═ D                    an Ansiblex: one jump
 *
 * HI is a highsec system, J a wormhole system: neither can hold an Ansiblex.
 */
const A = 30000001;
const B = 30000002;
const C = 30000003;
const D = 30000004;
const E = 30000005;
const HI = 30000006;
const J = 31000001;

const GRAPH: JumpGraph = new Map([
  [A, [B]],
  [B, [A, C]],
  [C, [B, D]],
  [D, [C, E]],
  [E, [D]],
  [HI, []],
  [J, []],
]);

const SYSTEMS: Record<string, { id: number; security: number }> = {
  'A-1': { id: A, security: -0.2 },
  'B-2': { id: B, security: -0.3 },
  'C-3': { id: C, security: -0.4 },
  '1DQ1-A': { id: D, security: -0.5 },
  'E-5': { id: E, security: 0.04 },
  Jita: { id: HI, security: 0.95 },
  J123456: { id: J, security: -0.99 },
};

const lookup: SystemLookup = (name) => {
  const key = Object.keys(SYSTEMS).find((known) => known.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : SYSTEMS[key];
};

const AD: AnsiblexGate = { fromId: A, toId: D, name: 'A-1 » 1DQ1-A - Highway' };

describe('the structure search term', () => {
  it('is » with a space either side, since ESI will not search fewer than three characters', () => {
    expect(ANSIBLEX_SEARCH).toBe(' » ');
    expect(ANSIBLEX_SEARCH.length).toBeGreaterThanOrEqual(3);
  });
});

describe('parseAnsiblexName', () => {
  it('reads both systems and the gate’s own name from an in-game name', () => {
    expect(parseAnsiblexName('A-1 » 1DQ1-A - Highway to Delve')).toEqual({
      from: 'A-1',
      to: '1DQ1-A',
      label: 'Highway to Delve',
    });
  });

  it('reads a bare pair, keeping the dashes in a system name', () => {
    expect(parseAnsiblexName('  J-GAMP » 1DQ1-A  ')).toEqual({
      from: 'J-GAMP',
      to: '1DQ1-A',
      label: null,
    });
  });

  it('is null for anything but two names joined by one »', () => {
    expect(parseAnsiblexName('A-1 to 1DQ1-A')).toBeNull();
    expect(parseAnsiblexName(' » 1DQ1-A')).toBeNull();
    expect(parseAnsiblexName('A-1 » ')).toBeNull();
    expect(parseAnsiblexName('A-1 » B-2 » C-3')).toBeNull();
  });
});

describe('parseGateList', () => {
  it('reads one gate per line, in either form, skipping blank lines', () => {
    expect(parseGateList('A-1 » 1DQ1-A - Highway\n\n  b-2 » c-3\n', lookup)).toEqual({
      gates: [
        { fromId: A, toId: D, name: 'A-1 » 1DQ1-A - Highway' },
        { fromId: B, toId: C, name: 'b-2 » c-3' },
      ],
      errors: [],
    });
  });

  it('lists back the systems it does not know, by line', () => {
    expect(parseGateList('A-1 » Nowhere\nSomewhere » Elsewhere', lookup).errors).toEqual([
      { line: 1, text: 'A-1 » Nowhere', reason: 'unknown', names: ['Nowhere'] },
      {
        line: 2,
        text: 'Somewhere » Elsewhere',
        reason: 'unknown',
        names: ['Somewhere', 'Elsewhere'],
      },
    ]);
  });

  it('reports a line that is not a gate, one joining a system to itself, and one outside nullsec', () => {
    const { gates, errors } = parseGateList(
      'just text\nA-1 » a-1\nJita » A-1\nJ123456 » A-1\nE-5 » A-1',
      lookup
    );
    expect(gates).toEqual([{ fromId: E, toId: A, name: 'E-5 » A-1' }]);
    expect(errors.map(({ line, reason, names }) => ({ line, reason, names }))).toEqual([
      { line: 1, reason: 'format', names: [] },
      { line: 2, reason: 'same-system', names: [] },
      { line: 3, reason: 'not-nullsec', names: ['Jita'] },
      { line: 4, reason: 'not-nullsec', names: ['J123456'] },
    ]);
  });

  it('keeps one gate per pair of systems, whichever way round it was written', () => {
    expect(parseGateList('A-1 » 1DQ1-A\n1DQ1-A » A-1 - Back', lookup).gates).toEqual([
      { fromId: A, toId: D, name: 'A-1 » 1DQ1-A' },
    ]);
  });
});

describe('foundGate', () => {
  const structure = {
    name: 'A-1 » 1DQ1-A - Highway',
    solar_system_id: A,
    type_id: ANSIBLEX_TYPE_ID,
  };

  it('is the gate an Ansiblex structure names, standing in the system ESI says', () => {
    expect(foundGate(structure, lookup)).toEqual({ kind: 'gate', gate: AD });
  });

  it('reads a structure whose type ESI leaves out by its name alone', () => {
    expect(foundGate({ name: structure.name, solar_system_id: A }, lookup)).toEqual({
      kind: 'gate',
      gate: AD,
    });
  });

  it('skips a structure of another type, or one not named like a gate', () => {
    expect(foundGate({ ...structure, type_id: 35832 }, lookup)).toEqual({ kind: 'skip' });
    expect(foundGate({ ...structure, name: 'A-1 - Keepstar' }, lookup)).toEqual({ kind: 'skip' });
  });

  it('skips a gate whose name places it somewhere other than the system ESI says', () => {
    expect(foundGate({ ...structure, solar_system_id: B }, lookup)).toEqual({ kind: 'skip' });
  });

  it('names the near system too when it is not one this app knows', () => {
    expect(foundGate({ ...structure, name: 'Elsewhere » 1DQ1-A' }, lookup)).toEqual({
      kind: 'unknown',
      names: ['Elsewhere'],
    });
  });

  it('names the far system when it is not one this app knows', () => {
    expect(foundGate({ ...structure, name: 'A-1 » Nowhere - Gate' }, lookup)).toEqual({
      kind: 'unknown',
      names: ['Nowhere'],
    });
  });
});

describe('bridgeConnections', () => {
  it('is each pair of systems once, for the search to cross both ways', () => {
    expect(
      bridgeConnections([
        AD,
        { fromId: D, toId: A, name: 'back' },
        { fromId: B, toId: E, name: '' },
      ])
    ).toEqual([
      [A, D],
      [B, E],
    ]);
  });
});

describe('routing over a bridge', () => {
  it('takes the bridge when it is cheaper, as one jump', () => {
    expect(findJumpRoute(GRAPH, A, E, { extraConnections: bridgeConnections([AD]) })).toEqual({
      kind: 'route',
      systems: [A, D, E],
    });
  });

  it('charges the bridge’s landing system like any other, never free', () => {
    const options = {
      preference: 'prefer-highsec' as const,
      securityOf: (id: number) => (id === D ? -0.5 : 0.5),
      extraConnections: bridgeConnections([AD]),
    };
    expect(findJumpRoute(GRAPH, A, D, options)).toEqual({ kind: 'route', systems: [A, D] });
    // One jump into D costs D's full price: the bridge saves the jumps before it, not the landing.
    const bridgeStep = routeCost(GRAPH, [A, D], options);
    expect(bridgeStep).toBe(routeCost(GRAPH, [C, D], { ...options, extraConnections: undefined }));
    expect(bridgeStep).toBeGreaterThan(1);
  });
});

describe('bridgeBetween', () => {
  it('finds the gate a step crosses, either way it is flown', () => {
    expect(bridgeBetween([AD], A, D)).toBe(AD);
    expect(bridgeBetween([AD], D, A)).toBe(AD);
    expect(bridgeBetween([AD], A, B)).toBeNull();
  });

  it('prefers the gate standing in the system the step leaves', () => {
    const DA: AnsiblexGate = { fromId: D, toId: A, name: 'D » A' };
    expect(bridgeBetween([DA, AD], A, D)).toBe(AD);
    expect(bridgeBetween([AD, DA], D, A)).toBe(DA);
  });
});
