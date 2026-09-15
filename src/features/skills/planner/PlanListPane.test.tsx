import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { DESKTOP_QUERY } from '@/lib/useIsDesktop';
import { PlanListPane } from './PlanListPane';

const CHAR_ID = 91;

function stubMatchMedia(matchesDesktop: boolean) {
  const real = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: matchesDesktop && media === DESKTOP_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  return () => {
    window.matchMedia = real;
  };
}

function scrollerDiv(container: HTMLElement): HTMLElement {
  const div = container.querySelector('.overflow-y-auto');
  if (!div) throw new Error('expected the scroller div');
  return div as HTMLElement;
}

beforeEach(async () => {
  await db.skillPlans.clear();
});

describe('PlanListPane: viewport height ignoring the mobile tab bar (#1096)', () => {
  it('applies no inline max-height on mobile, leaving the page (which already reserves room for the fixed tab bar) to scroll instead', async () => {
    const restore = stubMatchMedia(false);
    try {
      const { container } = render(
        <MemoryRouter>
          <PlanListPane activeCharacterId={CHAR_ID} remapInfo={null} />
        </MemoryRouter>
      );
      await screen.findByRole('button', { name: 'New plan' });

      expect(scrollerDiv(container).style.maxHeight).toBe('');
    } finally {
      restore();
    }
  });

  it('still caps the list to the viewport on desktop, where it sits beside another column', async () => {
    const restore = stubMatchMedia(true);
    try {
      const { container } = render(
        <MemoryRouter>
          <PlanListPane activeCharacterId={CHAR_ID} remapInfo={null} />
        </MemoryRouter>
      );
      await screen.findByRole('button', { name: 'New plan' });

      expect(scrollerDiv(container).style.maxHeight).not.toBe('');
    } finally {
      restore();
    }
  });
});
