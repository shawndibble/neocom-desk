import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { addCorpsErrorText } from './addCorpsErrorText';

const t = i18n.t.bind(i18n);

describe('addCorpsErrorText', () => {
  it('words a known reason', () => {
    expect(addCorpsErrorText(t, 'not-an-accountant')).toContain('CEO, Director or Accountant');
    expect(addCorpsErrorText(t, 'own-book-exists')).toContain('Delete it first');
  });
  it('falls back to the generic text for an unknown or missing reason', () => {
    const generic = addCorpsErrorText(t, undefined);
    expect(addCorpsErrorText(t, 'something-new')).toBe(generic);
    expect(generic).toContain('Could not connect');
  });
});
