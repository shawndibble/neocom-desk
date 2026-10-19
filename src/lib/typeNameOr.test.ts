import { describe, expect, it } from 'vitest';
import { typeNameOr } from './typeNameOr';

const t = (key: string, opts?: Record<string, unknown>) => `${key}:${opts?.id}`;

describe('typeNameOr', () => {
  it('returns the name when known', () => {
    expect(typeNameOr(t, 'Rifter', 587)).toBe('Rifter');
  });

  it('falls back to the unknown-type label with the id', () => {
    expect(typeNameOr(t, undefined, 587)).toBe('common.unknownType:587');
  });
});
