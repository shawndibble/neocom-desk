import { describe, expect, it } from 'vitest';
import { plainTextActionClassName } from './plainTextActionClassName';

describe('plainTextActionClassName', () => {
  it('is body-colour and underlined at rest, never accent', () => {
    const cls = plainTextActionClassName();
    expect(cls).toContain('text-text');
    expect(cls).toContain('underline');
    expect(cls).not.toContain('text-accent');
  });
});
