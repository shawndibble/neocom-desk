import { describe, expect, it } from 'vitest';
import { groupByOrganization, type OrgMember } from './orgGroups';

interface Row extends OrgMember {
  name: string;
}

function row(
  name: string,
  corp: [number, string | null] | null,
  alliance: [number, string | null] | null
): Row {
  return {
    name,
    corporationId: corp?.[0] ?? null,
    corporationName: corp?.[1] ?? null,
    allianceId: alliance?.[0] ?? null,
    allianceName: alliance?.[1] ?? null,
  };
}

const LOTUS: [number, string] = [99_1, 'Black Lotus'];
const PACT: [number, string] = [99_2, 'Frontier Pact'];
const VANGUARD: [number, string] = [98_1, 'Lotus Vanguard'];
const HARBOR: [number, string] = [98_2, 'Night Harbor'];
const SALVAGE: [number, string] = [98_3, 'Pact Salvage'];
const EMBER: [number, string] = [98_4, 'Drifting Ember'];

const names = (rows: readonly Row[]) => rows.map((r) => r.name);

describe('groupByOrganization', () => {
  it('heads an alliance with two corporations here, with a group per corporation', () => {
    const { sections } = groupByOrganization([
      row('a', VANGUARD, LOTUS),
      row('b', HARBOR, LOTUS),
      row('c', VANGUARD, LOTUS),
    ]);
    expect(sections).toHaveLength(1);
    const [lotus] = sections;
    expect(lotus).toMatchObject({ kind: 'alliance', id: LOTUS[0], name: 'Black Lotus' });
    expect(lotus.alliance).toBeNull();
    expect(names(lotus.rows)).toEqual(['a', 'b', 'c']);
    expect(lotus.corporations.map((c) => [c.id, names(c.rows)])).toEqual([
      [VANGUARD[0], ['a', 'c']],
      [HARBOR[0], ['b']],
    ]);
  });

  it('heads a one-corporation alliance by the corporation, naming the alliance beside it', () => {
    const { sections } = groupByOrganization([row('a', SALVAGE, PACT), row('b', SALVAGE, PACT)]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      kind: 'corporation',
      id: SALVAGE[0],
      name: 'Pact Salvage',
      alliance: { id: PACT[0], name: 'Frontier Pact' },
    });
    expect(sections[0].corporations).toHaveLength(1);
  });

  it('heads a corporation with no alliance by itself', () => {
    const { sections } = groupByOrganization([row('a', EMBER, null), row('b', EMBER, null)]);
    expect(sections[0]).toMatchObject({ kind: 'corporation', id: EMBER[0], alliance: null });
  });

  it('puts a pilot with no one else from their corporation or alliance in alone', () => {
    const { sections, alone } = groupByOrganization([
      row('solo-corp', EMBER, null),
      row('solo-alliance', SALVAGE, PACT),
      row('a', VANGUARD, LOTUS),
      row('b', VANGUARD, LOTUS),
    ]);
    expect(sections.map((s) => s.id)).toEqual([VANGUARD[0]]);
    expect(names(alone)).toEqual(['solo-corp', 'solo-alliance']);
  });

  it('keeps a pilot whose corporation is not known yet out of every group', () => {
    const { sections, alone, unplaced } = groupByOrganization([
      row('pending', null, null),
      row('a', EMBER, null),
    ]);
    expect(sections).toEqual([]);
    expect(names(alone)).toEqual(['a']);
    expect(names(unplaced)).toEqual(['pending']);
  });

  it('orders groups and corporations largest first, then by name', () => {
    const { sections } = groupByOrganization([
      row('e1', EMBER, null),
      row('e2', EMBER, null),
      row('s1', SALVAGE, PACT),
      row('s2', SALVAGE, PACT),
      row('h1', HARBOR, LOTUS),
      row('v1', VANGUARD, LOTUS),
      row('v2', VANGUARD, LOTUS),
    ]);
    expect(sections.map((s) => s.name)).toEqual(['Black Lotus', 'Drifting Ember', 'Pact Salvage']);
    expect(sections[0].corporations.map((c) => c.name)).toEqual(['Lotus Vanguard', 'Night Harbor']);
  });

  it('sorts a group whose name has not loaded yet by id, after named ones of its size', () => {
    const { sections } = groupByOrganization([
      row('u1', [98_9, null], null),
      row('u2', [98_9, null], null),
      row('e1', EMBER, null),
      row('e2', EMBER, null),
    ]);
    expect(sections.map((s) => s.id)).toEqual([EMBER[0], 98_9]);
  });
});
