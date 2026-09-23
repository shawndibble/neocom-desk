import { describe, it, expect } from 'vitest';
import { definePageTabs, isWithinPage, tabFromPathname, tabPath } from './pageTabs';

const page = definePageTabs('/contacts', [
  { id: 'character', labelKey: 'a' },
  { id: 'across', labelKey: 'b' },
]);

describe('definePageTabs', () => {
  it('defaults to the first tab', () => {
    expect(page.defaultTab).toBe('character');
  });

  it('accepts an explicit default', () => {
    const other = definePageTabs(
      '/x',
      [
        { id: 'a', labelKey: 'a' },
        { id: 'b', labelKey: 'b' },
      ],
      'b'
    );
    expect(other.defaultTab).toBe('b');
  });
});

describe('tabFromPathname', () => {
  it('resolves a declared tab segment', () => {
    expect(tabFromPathname(page, '/contacts/across')).toBe('across');
    expect(tabFromPathname(page, '/contacts/across/')).toBe('across');
  });

  it('is null for the bare page, an unknown segment, or a deeper path', () => {
    expect(tabFromPathname(page, '/contacts')).toBeNull();
    expect(tabFromPathname(page, '/contacts/nope')).toBeNull();
    expect(tabFromPathname(page, '/contacts/across/more')).toBeNull();
    expect(tabFromPathname(page, '/contactsacross')).toBeNull();
  });
});

describe('tabPath / isWithinPage', () => {
  it('builds the tab href', () => {
    expect(tabPath(page, 'across')).toBe('/contacts/across');
  });

  it('matches the page and what is below it, not a prefix-sharing sibling', () => {
    expect(isWithinPage(page, '/contacts')).toBe(true);
    expect(isWithinPage(page, '/contacts/across')).toBe(true);
    expect(isWithinPage(page, '/contactsx')).toBe(false);
  });
});
