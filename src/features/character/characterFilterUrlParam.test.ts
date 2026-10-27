import { describe, it, expect } from 'vitest';
import { characterFilterParam } from './characterFilterUrlParam';

describe('characterFilterParam', () => {
  const codec = characterFilterParam('current');

  it('omits the default and parses absence back to it', () => {
    expect(codec.serialize('current')).toBeNull();
    expect(codec.parse(null)).toBe('current');
  });

  it('round-trips "all"', () => {
    expect(codec.parse(codec.serialize('all'))).toBe('all');
  });

  it('falls back to the default for garbage', () => {
    expect(codec.parse('someone')).toBe('current');
    expect(codec.parse('1,x')).toBe('current');
    expect(codec.parse('')).toBe('current');
  });

  it('reads a legacy hand-picked-subset URL (predating the current/all narrowing) as "all"', () => {
    expect(codec.parse('9,3')).toBe('all');
  });

  it('treats an "all" default by value', () => {
    const allDefault = characterFilterParam('all');
    expect(allDefault.serialize('all')).toBeNull();
    expect(allDefault.serialize('current')).toBe('current');
  });
});
