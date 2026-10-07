import { describe, expect, it } from 'vitest';
import en from './locales/en.json';

function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (node && typeof node === 'object') return Object.values(node).flatMap(strings);
  return [];
}

describe('en.json empty-state copy', () => {
  it('never tells the player to "Reconnect to fetch" (the cause may be ESI, not their connection)', () => {
    expect(strings(en).filter((value) => /reconnect to fetch/i.test(value))).toEqual([]);
  });
});
