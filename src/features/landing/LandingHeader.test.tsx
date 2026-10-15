import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import '@/i18n';
import { DISCORD_URL, REPO_URL } from '@/lib/links';
import { LandingHeader } from './LandingHeader';
import { LANDING_ANCHORS } from './landingAnchors';

type Callback = (entries: { isIntersecting: boolean }[]) => void;

/** Installs a mock IntersectionObserver and returns a function reporting the hero's visibility. */
function mockObserver(): (visible: boolean) => void {
  let callback: Callback = () => {};
  class MockObserver {
    constructor(cb: Callback) {
      callback = cb;
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', MockObserver);
  return (visible) => act(() => callback([{ isIntersecting: visible }]));
}

function setup(onLogin = vi.fn()) {
  const ref = createRef<HTMLDivElement>();
  render(
    <>
      <LandingHeader heroCtaRef={ref} pending={false} onLogin={onLogin} />
      <div ref={ref} />
    </>
  );
  return onLogin;
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

  it('shows the small login button only once the hero button is out of view', async () => {
    const report = mockObserver();
    const onLogin = setup();
    report(true);
    expect(screen.queryByRole('button', { name: 'Log in with EVE Online' })).toBeNull();
    report(false);
    await userEvent.click(screen.getByRole('button', { name: 'Log in with EVE Online' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    report(true);
    expect(screen.queryByRole('button', { name: 'Log in with EVE Online' })).toBeNull();
  });
});
