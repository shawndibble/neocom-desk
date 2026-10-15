import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import '@/i18n';
import { DISCORD_URL, REPO_URL } from '@/lib/links';
import { LandingHeader } from './LandingHeader';
import { LANDING_ANCHORS } from './landingAnchors';

type Callback = (entries: { target: Element; isIntersecting: boolean }[]) => void;

/** Installs a mock IntersectionObserver and returns a function reporting one observed element's visibility. */
function mockObserver(): (target: Element, visible: boolean) => void {
  let callback: Callback = () => {};
  class MockObserver {
    constructor(cb: Callback) {
      callback = cb;
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', MockObserver);
  return (target, visible) => act(() => callback([{ target, isIntersecting: visible }]));
}

function setup(onLogin = vi.fn()) {
  const hero = createRef<HTMLDivElement>();
  const bottom = createRef<HTMLDivElement>();
  const ctaRefs = [hero, bottom];
  render(
    <>
      <LandingHeader ctaRefs={ctaRefs} pending={false} onLogin={onLogin} />
      <div ref={hero} data-testid="hero" />
      <div ref={bottom} data-testid="bottom" />
    </>
  );
  return {
    onLogin,
    hero: () => screen.getByTestId('hero'),
    bottom: () => screen.getByTestId('bottom'),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('LandingHeader', () => {
  it('is a banner with section anchors and external Discord and GitHub links', () => {
    setup();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Page sections' });
    for (const { id } of LANDING_ANCHORS) {
      expect(nav.querySelector(`a[href="#${id}"]`)).not.toBeNull();
    }
    const discord = screen.getByRole('link', { name: 'Join the Discord' });
    expect(discord).toHaveAttribute('href', DISCORD_URL);
    expect(discord).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'View the source on GitHub' })).toHaveAttribute(
      'href',
      REPO_URL
    );
  });

  it('shows no login button without IntersectionObserver', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Log in with EVE Online' })).toBeNull();
  });

  it('shows the small login button only once every large one is out of view', async () => {
    const report = mockObserver();
    const { onLogin, hero, bottom } = setup();
    const name = { name: 'Log in with EVE Online' };
    // Nothing has reported yet: stay hidden.
    expect(screen.queryByRole('button', name)).toBeNull();
    report(hero(), true);
    report(bottom(), false);
    expect(screen.queryByRole('button', name)).toBeNull();
    report(hero(), false);
    await userEvent.click(screen.getByRole('button', name));
    expect(onLogin).toHaveBeenCalledTimes(1);
    report(hero(), true);
    expect(screen.queryByRole('button', name)).toBeNull();
  });

  it('hides the small login button while the closing call to action is on screen', () => {
    const report = mockObserver();
    const { hero, bottom } = setup();
    const name = { name: 'Log in with EVE Online' };
    report(hero(), false);
    report(bottom(), false);
    expect(screen.getByRole('button', name)).toBeInTheDocument();
    report(bottom(), true);
    expect(screen.queryByRole('button', name)).toBeNull();
  });
});
