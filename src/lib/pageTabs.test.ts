import { describe, it, expect, vi, afterEach } from 'vitest';
import { definePageTabs, isIndexPath, isWithinPage, tabFromPathname, tabPath } from './pageTabs';

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

describe('isIndexPath', () => {
  const indexed = definePageTabs(
    '/settings',
    [
      { id: 'display', labelKey: 'a' },
      { id: 'faq', labelKey: 'b' },
    ],
    undefined,
    { hiddenFrom: '(min-width: 48rem)' }
  );

  function stubViewport(wide: boolean) {
    vi.stubGlobal('window', { matchMedia: (media: string) => ({ media, matches: wide }) });
  }

  afterEach(() => vi.unstubAllGlobals());

  it('shows the index on the bare base path below the breakpoint only', () => {
    stubViewport(false);
    expect(isIndexPath(indexed, '/settings')).toBe(true);
    expect(isIndexPath(indexed, '/settings/')).toBe(true);
    expect(isIndexPath(indexed, '/settings/faq')).toBe(false);
    expect(isIndexPath(indexed, '/settings/nope')).toBe(false);
    stubViewport(true);
    expect(isIndexPath(indexed, '/settings')).toBe(false);
  });

  it('is never on for a page that declares no index', () => {
    stubViewport(false);
    expect(isIndexPath(page, '/contacts')).toBe(false);
  });
});
