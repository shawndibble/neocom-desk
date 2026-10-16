// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import indexHtml from '/index.html?raw';
import {
  LANDING_SHELL_ATTR,
  LANDING_SHELL_ID,
  LANDING_SHELL_SHOWN_ATTR,
  releaseLandingShell,
} from './landingShell';
import { SIGNED_IN_SHELL_HINT_KEY } from './signedInShellHint';
import { PLAY_STORE_FLAG_KEY, PLAY_STORE_PACKAGE } from '@/lib/playStoreApp';

/**
 * The landing-shell boot script in `index.html` runs before any bundle, so it
 * carries its own copies of the signed-in hint key, the Play Store flag and
 * package, and the `<html>` attributes. This runs the script as shipped, so
 * those copies cannot drift from the modules that own them.
 */
function bootScript(): string {
  const match = /<script id="landing-shell-boot">([\s\S]*?)<\/script>/.exec(indexHtml);
  if (match === null) throw new Error('index.html has no #landing-shell-boot script');
  return match[1];
}

function runBootScript(): void {
  // Indirect eval: the script runs at global scope, as a classic <script> does.
  (0, eval)(bootScript());
}

const html = document.documentElement;

function at(pathname: string): void {
  window.history.replaceState(null, '', pathname);
}

function shell(): Element | null {
  return document.getElementById(LANDING_SHELL_ID);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = `<template id="landing-shell-template"><div id="${LANDING_SHELL_ID}">hero</div></template>`;
  at('/login');
});

afterEach(() => {
  html.removeAttribute(LANDING_SHELL_ATTR);
  html.removeAttribute(LANDING_SHELL_SHOWN_ATTR);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('index.html landing-shell boot script', () => {
  it('sits in <body> ahead of #root, after the template it clones, as a classic script', () => {
    const body = new DOMParser().parseFromString(indexHtml, 'text/html').body;
    const order = [...body.children].map((el) => el.id);
    expect(order.indexOf('landing-shell-template')).toBeLessThan(
      order.indexOf('landing-shell-boot')
    );
    expect(order.indexOf('landing-shell-boot')).toBeLessThan(order.indexOf('root'));
    const script = body.querySelector('script#landing-shell-boot');
    expect(script?.hasAttribute('type')).toBe(false);
    expect(script?.hasAttribute('src')).toBe(false);
  });

  it('keeps the marker vite.config.ts fills with the prerendered hero', () => {
    const template = new DOMParser()
      .parseFromString(indexHtml, 'text/html')
      .querySelector('template#landing-shell-template');
    expect(template?.innerHTML).toBe('<!-- landing-shell -->');
  });

  it("copies the owning modules' keys", () => {
    const script = bootScript();
    expect(script).toContain(`'${SIGNED_IN_SHELL_HINT_KEY}'`);
    expect(script).toContain(`'${PLAY_STORE_FLAG_KEY}'`);
    expect(script).toContain(`'android-app://${PLAY_STORE_PACKAGE}'`);
    expect(script).toContain(`'${LANDING_SHELL_ATTR}'`);
    expect(script).toContain(`'${LANDING_SHELL_SHOWN_ATTR}'`);
  });

  it.each(['/', '/login'])('shows the shell on %s for a first-time visitor', (path) => {
    at(path);
    runBootScript();
    expect(shell()?.textContent).toBe('hero');
    expect(html.hasAttribute(LANDING_SHELL_ATTR)).toBe(true);
    expect(html.hasAttribute(LANDING_SHELL_SHOWN_ATTR)).toBe(true);
  });

  it.each(['/overview', '/callback', '/login/extra'])('stays out on %s', (path) => {
    at(path);
    runBootScript();
    expect(shell()).toBeNull();
    expect(html.hasAttribute(LANDING_SHELL_ATTR)).toBe(false);
  });

  it('stays out for a returning pilot', () => {
    localStorage.setItem(SIGNED_IN_SHELL_HINT_KEY, '1');
    runBootScript();
    expect(shell()).toBeNull();
    expect(html.hasAttribute(LANDING_SHELL_ATTR)).toBe(false);
  });

  it('stays out in the Play Store app, by flag or by launch referrer', () => {
    sessionStorage.setItem(PLAY_STORE_FLAG_KEY, '1');
    runBootScript();
    expect(shell()).toBeNull();

    sessionStorage.clear();
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(`android-app://${PLAY_STORE_PACKAGE}`);
    runBootScript();
    expect(shell()).toBeNull();
    expect(html.hasAttribute(LANDING_SHELL_ATTR)).toBe(false);
  });

  it('never hides #root behind an empty template', () => {
    document.body.innerHTML =
      '<template id="landing-shell-template"><!-- landing-shell --></template>';
    runBootScript();
    expect(html.hasAttribute(LANDING_SHELL_ATTR)).toBe(false);
  });

  it('stays out, without throwing, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(runBootScript).not.toThrow();
    expect(shell()).toBeNull();
    expect(html.hasAttribute(LANDING_SHELL_ATTR)).toBe(false);
  });
});

describe('releaseLandingShell', () => {
  it('removes the shell and shows #root, keeping the shown mark', () => {
    runBootScript();
    releaseLandingShell();
    expect(shell()).toBeNull();
    expect(html.hasAttribute(LANDING_SHELL_ATTR)).toBe(false);
    expect(html.hasAttribute(LANDING_SHELL_SHOWN_ATTR)).toBe(true);
  });

  it('is a no-op when no shell was shown', () => {
    expect(releaseLandingShell).not.toThrow();
  });
});
