import { describe, it, expect } from 'vitest';
import { characterStack } from './characterStack';

const ROSTER = [
  { characterId: 1, name: 'Alpha' },
  { characterId: 2, name: 'Bravo' },
  { characterId: 3, name: 'Charlie' },
  { characterId: 4, name: 'Delta' },
  { characterId: 5, name: 'Echo' },
  { characterId: 6, name: 'Foxtrot' },
];

describe('characterStack', () => {
  it('puts the active Character first, then the roster in order', () => {
    expect(characterStack(ROSTER.slice(0, 3), 2)).toEqual({ faces: [2, 1, 3], extra: 0 });
  });

  it('caps the faces at three and counts the rest as +N', () => {
    expect(characterStack(ROSTER, 5)).toEqual({ faces: [5, 1, 2], extra: 3 });
  });

  it('leaves out the Characters named missing, from the faces and the count', () => {
    expect(characterStack(ROSTER, 1, ['Bravo', 'Echo'])).toEqual({ faces: [1, 3, 4], extra: 1 });
  });

  it('does not lead with an active Character that is itself missing', () => {
    expect(characterStack(ROSTER.slice(0, 3), 2, ['Bravo'])).toEqual({ faces: [1, 3], extra: 0 });
  });

  it('keeps roster order with no active Character', () => {
    expect(characterStack(ROSTER.slice(0, 2), null)).toEqual({ faces: [1, 2], extra: 0 });
  });

  it('takes a smaller cap (the phone trigger), counting the rest as +N', () => {
    expect(characterStack(ROSTER, 1, [], 2)).toEqual({ faces: [1, 2], extra: 4 });
    expect(characterStack(ROSTER.slice(0, 3), 3, [], 2)).toEqual({ faces: [3, 1], extra: 1 });
    expect(characterStack(ROSTER.slice(0, 2), 1, [], 2)).toEqual({ faces: [1, 2], extra: 0 });
  });

  it('is empty for an empty roster', () => {
    expect(characterStack([], 1)).toEqual({ faces: [], extra: 0 });
  });
});
