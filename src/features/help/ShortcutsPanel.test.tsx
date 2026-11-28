import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { ShortcutsPanel } from './ShortcutsPanel';

function headings(): string[] {
  return screen.getAllByRole('heading').map((heading) => heading.textContent ?? '');
}

describe('ShortcutsPanel', () => {
  it('lists keyboard shortcuts first with a mouse', () => {
    render(<ShortcutsPanel />);
    const all = headings();
    expect(all.indexOf('Keyboard shortcuts')).toBeLessThan(all.indexOf('Paste anywhere'));
  });

  it('puts Paste anywhere first under a finger and still lists the shortcuts', () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({ ...matchMedia(query), matches: query === '(pointer: coarse)' }) as MediaQueryList;
    try {
      render(<ShortcutsPanel />);
      const all = headings();
      expect(all.indexOf('Paste anywhere')).toBeLessThan(all.indexOf('Keyboard shortcuts'));
      expect(all).toContain('Keyboard shortcuts');
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});
