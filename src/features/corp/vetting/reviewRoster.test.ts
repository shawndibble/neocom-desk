import { describe, expect, it } from 'vitest';
import {
  markMembers,
  matchParts,
  narrowMembers,
  pickable,
  roleSuggestions,
  type RosterMember,
} from './reviewRoster';

const m = (characterId: number, name: string, extra: Partial<RosterMember> = {}): RosterMember => ({
  characterId,
  name,
  ...extra,
});

describe('narrowMembers', () => {
  const all = [m(1, 'Lauren Brask'), m(2, 'Renna Oku'), m(3, 'Ren Halvard'), m(4, 'Joss Arden')];
  it('sorts by name when the query is empty, keeping everyone', () => {
    expect(narrowMembers(all, '  ').map((x) => x.name)).toEqual([
      'Joss Arden',
      'Lauren Brask',
      'Ren Halvard',
      'Renna Oku',
    ]);
  });
  it('puts names starting with the query first, then names containing it, ignoring case', () => {
    expect(narrowMembers(all, 'REN').map((x) => x.name)).toEqual([
      'Ren Halvard',
      'Renna Oku',
      'Lauren Brask',
    ]);
  });
  it('returns nothing for an unknown name', () => {
    expect(narrowMembers(all, 'zzz')).toEqual([]);
  });
});

describe('matchParts', () => {
  it('splits a name around the first match', () => {
    expect(matchParts('Lauren Brask', 'ren')).toEqual({
      before: 'Lau',
      match: 'ren',
      after: ' Brask',
    });
  });
  it('has no match for an empty or absent query', () => {
    expect(matchParts('Joss', '')).toEqual({ before: 'Joss', match: '', after: '' });
    expect(matchParts('Joss', 'x')).toEqual({ before: 'Joss', match: '', after: '' });
  });
});

describe('markMembers and pickable', () => {
  const rows = markMembers([m(1, 'Ana'), m(2, 'Bo'), m(3, 'Cy')], {
    selfId: 3,
    waiting: new Map([[2, { at: 100, by: 'Ilse' }]]),
  });
  it('marks the waiting member and the officer, and only free members are pickable', () => {
    expect(rows[1].waiting).toEqual({ at: 100, by: 'Ilse' });
    expect(rows[2].you).toBe(true);
    expect(rows.map(pickable)).toEqual([true, false, false]);
  });
});

describe('roleSuggestions', () => {
  it('lists corp titles first, then EVE roles not already a title, narrowed by the text', () => {
    expect(roleSuggestions('', ['Miner', 'Director'], ['Director', 'Accountant'])).toEqual({
      titles: ['Miner', 'Director'],
      roles: ['Accountant'],
    });
    expect(roleSuggestions('mi', ['Miner', 'Hauler'], ['Accountant'])).toEqual({
      titles: ['Miner'],
      roles: [],
    });
  });
  it('drops a suggestion that equals what is typed', () => {
    expect(roleSuggestions('miner', ['Miner'], []).titles).toEqual([]);
  });
});
