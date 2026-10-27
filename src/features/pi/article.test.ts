import { describe, it, expect } from 'vitest';
import { withArticle } from './article';

describe('withArticle', () => {
  it('uses "an" before a vowel sound', () => {
    expect(withArticle('Ice')).toBe('an Ice');
    expect(withArticle('Oceanic')).toBe('an Oceanic');
  });
  it('uses "a" before a consonant', () => {
    expect(withArticle('Lava')).toBe('a Lava');
    expect(withArticle('Barren')).toBe('a Barren');
    expect(withArticle('Gas')).toBe('a Gas');
  });
});
