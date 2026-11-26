import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import en from '@/i18n/locales/en.json';
import { LANDING_SHELL_ID } from '@/app/landingShell';
import { Login } from '@/routes/Login';

const HEADING = `${en.login.heading} ${en.login.headingAccent}`;

async function landingShellHtml(): Promise<string> {
  const { container } = render(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>
  );
  await screen.findByRole('heading', { level: 1, name: HEADING });

  const page = container.querySelector('.landing-root');
  const header = page?.querySelector(':scope > header');
  const hero = page?.querySelector(':scope > main > section')?.cloneNode(true);
  if (!page || !header || !(hero instanceof HTMLElement)) {
    throw new Error('Login no longer renders a header and a hero section');
  }
  const shell = document.createElement('div');
  shell.id = LANDING_SHELL_ID;
  shell.className = page.className;
  shell.setAttribute('inert', '');
  const main = document.createElement('main');
  main.append(hero);
  shell.append(header.cloneNode(true), main);
  return `${shell.outerHTML}\n`;
}

beforeEach(async () => {
  sessionStorage.clear();
  await db.characters.clear();
});

describe('landing shell', () => {
  it('matches the Login hero as rendered', async () => {
    await expect(await landingShellHtml()).toMatchFileSnapshot('./landingShell.snapshot.html');
  });

  it('holds the first screen and the ship as a high-priority load', async () => {
    const shell = new DOMParser().parseFromString(await landingShellHtml(), 'text/html');
    expect(shell.querySelector('h1')?.textContent).toBe(HEADING);
    expect(shell.body.textContent).toContain(en.login.tagline);
    expect(
      shell.querySelector('img[src="/landing/megathron.webp"]')?.getAttribute('fetchpriority')
    ).toBe('high');
    expect(shell.querySelector('[aria-labelledby="login-preview-label"]')).toBeNull();
    expect(shell.querySelectorAll(`[id]:not(#${LANDING_SHELL_ID})`)).toHaveLength(0);
  });
});
