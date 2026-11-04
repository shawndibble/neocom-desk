// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { focusPageSearch, PRIMARY_SEARCH_ATTRIBUTE } from './pageSearch';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusPageSearch', () => {
  it("focuses the page's FilterBar search box over any other search box", () => {
    document.body.innerHTML = `
      <main>
        <input type="search" id="other" />
        <input type="search" id="primary" ${PRIMARY_SEARCH_ATTRIBUTE} value="veld" />
      </main>`;
    expect(focusPageSearch()).toBe(true);
    const primary = document.getElementById('primary') as HTMLInputElement;
    expect(document.activeElement).toBe(primary);
    // Selected, so typing replaces the old query the way a browser's own find box does.
    expect(primary.selectionStart).toBe(0);
    expect(primary.selectionEnd).toBe(4);
  });

  it('falls back to the first search box on a page with no FilterBar', () => {
    document.body.innerHTML = `<main><input type="search" id="only" /></main>`;
    expect(focusPageSearch()).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('only'));
  });

  it('ignores search boxes outside the page content, and disabled or inert ones', () => {
    document.body.innerHTML = `
      <nav><input type="search" id="nav" /></nav>
      <main>
        <input type="search" disabled />
        <div inert><input type="search" /></div>
      </main>`;
    expect(focusPageSearch()).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});
