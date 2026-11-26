import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { DEFAULT_TIME_FORMAT, TIME_FORMAT_SETTING_KEY, useTimeFormat } from '@/lib/timeFormat';
import { App } from './App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

mswServer(
  http.get('https://esi.evetech.net/*', () =>
    HttpResponse.json({ error: 'offline' }, { status: 500 })
  )
);

beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: false });
  window.history.pushState({}, '', '/');
});

describe('boot gate spinner (UX-REVIEW #1)', () => {
  it('shows the app name and a visible "Loading…" line, not a bare spinner', () => {
    render(<App />);
    expect(screen.getByText('Neocom Desk')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});

describe('device-local preference hydration', () => {
  it('hydrates the Time format preference from Dexie at app start', async () => {
    await db.settings.put({ key: TIME_FORMAT_SETTING_KEY, value: 'eve' });
    render(<App />);
    await waitFor(() => expect(useTimeFormat.getState().value).toBe('eve'));
  });
});

describe('routing guard', () => {
  it('redirects / to /login when no characters exist', async () => {
    render(<App />);
    expect(
      (await screen.findAllByRole('button', { name: /log in with eve online/i })).length
    ).toBeGreaterThanOrEqual(1);
    expect(window.location.pathname).toBe('/login');
  });

  it('keeps a landing section hash when it redirects / to /login', async () => {
    window.history.pushState({}, '', '/#login-faq');
    render(<App />);
    await screen.findAllByRole('button', { name: /log in with eve online/i });
    expect(window.location.pathname).toBe('/login');
    expect(window.location.hash).toBe('#login-faq');
  });

  it('redirects / to /overview when a character is already active', async () => {
    await db.characters.put({
      characterId: 91,
      name: 'Pilot One',
      ownerHash: 'oh-1',
      addedAt: Date.now(),
    });
    await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: 91 });
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/overview'));
    expect(await screen.findByRole('link', { name: 'Clones' })).toBeInTheDocument();
  });

  it('redirects / to /characters when characters exist but none is active', async () => {
    await db.characters.put({
      characterId: 91,
      name: 'Pilot One',
      ownerHash: 'oh-1',
      addedAt: Date.now(),
    });
    render(<App />);
    expect(await screen.findByText('Pilot One')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/characters');
  });
});
