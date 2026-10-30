import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { App } from '@/app/App';
import * as download from '@/lib/download';
import {
  CHAR_ID,
  CHAR_ID_2,
  ESI,
  addSecondCharacter,
  contactsPayload,
  installContactsHarness,
  server,
  showAllCharacters,
} from '@/test/contactsPage';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

installContactsHarness();

/** The page header's export button › Download CSV (jsdom has no hover intent). */
async function exportCsv(menuName: string) {
  const user = userEvent.setup({ delay: null });
  fireEvent.pointerDown(screen.getByRole('button', { name: menuName }), {
    button: 0,
    pointerType: 'mouse',
  });
  (await screen.findByRole('menuitem', { name: 'Download CSV' })).focus();
  await user.keyboard('{Enter}');
  await waitFor(() => expect(vi.mocked(download.downloadTextFile)).toHaveBeenCalled());
}

describe('CSV export (issue #2164)', () => {
  it('exports the Character tab visible rows, with a raw standing number', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    render(<App />);
    await screen.findByText('Good Friend');

    await exportCsv('Export Contacts');

    expect(spy).toHaveBeenCalledTimes(1);
    const [filename, content] = spy.mock.calls[0];
    expect(filename).toMatch(/^neocom-contacts-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(content).toContain('Good Friend');
    // The standing tag replaces the printed number on screen, but the CSV
    // still carries the raw value the table sorts on.
    expect(content).toContain('10');
  });

  it('exports only what the search/type/standing filters currently show', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    render(<App />);
    await screen.findByText('Good Friend');
    await userEvent
      .setup({ delay: null })
      .type(screen.getByRole('searchbox', { name: 'Name' }), 'friend');
    await waitFor(() => expect(screen.queryByText('Neutral Corp')).not.toBeInTheDocument());

    await exportCsv('Export Contacts');

    const content = spy.mock.calls[0][1];
    expect(content).toContain('Good Friend');
    expect(content).not.toContain('Neutral Corp');
  });

  it('marks a truncated fetch with a -partial filename suffix', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'contacts',
      value: contactsPayload,
      fetchedAt: Date.now(),
      truncated: true,
    });
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    render(<App />);
    await screen.findByText('Good Friend');

    await exportCsv('Export Contacts');

    expect(spy.mock.calls[0][0]).toMatch(/-partial\.csv$/);
  });

  it('exports the Across tab own rows, not the Character tab rows', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    await addSecondCharacter();
    await db.esiCache.put({
      characterId: CHAR_ID_2,
      key: 'contacts',
      value: [contactsPayload[0]],
      fetchedAt: Date.now(),
    });
    render(<App />);
    await screen.findByText('Good Friend');
    await showAllCharacters();
    await screen.findByRole('table', { name: /across/i });

    await exportCsv('Export Across characters');

    expect(spy).toHaveBeenCalledTimes(1);
    const [filename, content] = spy.mock.calls[0];
    expect(filename).toMatch(/^neocom-contacts-across-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(content).toContain('Good Friend');
    // Every contact appears on the Across tab, held by one character or the
    // other — Bad Alliance is only ever on the main, but it is still a row.
    expect(content).toContain('Bad Alliance');
  });

  it('marks the Across tab export -partial when any one character behind it was truncated', async () => {
    await addSecondCharacter();
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'contacts',
      value: contactsPayload,
      fetchedAt: Date.now(),
      truncated: true,
    });
    await db.esiCache.put({
      characterId: CHAR_ID_2,
      key: 'contacts',
      value: [contactsPayload[0]],
      fetchedAt: Date.now(),
    });
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    render(<App />);
    await screen.findByText('Good Friend');
    await showAllCharacters();
    await screen.findByRole('table', { name: /across/i });

    await exportCsv('Export Across characters');

    expect(spy.mock.calls[0][0]).toMatch(/^neocom-contacts-across-\d{4}-\d{2}-\d{2}-partial\.csv$/);
  });

  it('still exports when the active tab has nothing visible — a header-only file, like every table', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.json([])));
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    render(<App />);
    await screen.findByText('No contacts');

    await exportCsv('Export Contacts');

    expect(spy.mock.calls[0][1].trim().split('\r\n')).toHaveLength(1);
  });
});

describe('Contacts standing tag (issue #403)', () => {
  it("uses the game's standing tag, and keeps the number in its accessible name", async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    const goodRow = screen.getByText('Good Friend').closest('tr');
    expect(goodRow).not.toBeNull();
    expect(
      within(goodRow as HTMLElement).getByRole('img', { name: 'Excellent standing (10)' })
    ).toBeInTheDocument();
    // The bar and the printed number it replaces are both gone.
    expect(within(goodRow as HTMLElement).queryByText('10')).toBeNull();
  });

  it('tags each tier by the standing it is for', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    expect(screen.getAllByRole('img', { name: 'Neutral standing (0)' }).length).toBe(2);
    expect(screen.getByRole('img', { name: 'Terrible standing (-10)' })).toBeInTheDocument();
  });
});

describe('Contacts URL state', () => {
  it('restores the search text and sort from the URL', async () => {
    window.history.replaceState({}, '', '/contacts/character?q=corp&sort=name:asc');
    render(<App />);
    const table = within(await screen.findByRole('table', { name: 'Contacts' }));
    expect(screen.getByRole('searchbox', { name: 'Name' })).toHaveValue('corp');
    expect(table.queryByText('Good Friend')).not.toBeInTheDocument();
    expect(table.getByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it('writes typed search text to the URL once typing pauses', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText('Good Friend');
    await user.type(screen.getByRole('searchbox', { name: 'Name' }), 'friend');
    await waitFor(() => expect(window.location.search).toBe('?q=friend'));
    expect(window.location.pathname).toBe('/contacts/character');
  });

  it('writes a header sort to the URL, and leaves the default sort out', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await screen.findByText('Good Friend');
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(window.location.search).toBe('?sort=name%3Aasc');
  });

  it('ignores an unreadable sort and falls back to standing, best first', async () => {
    window.history.replaceState({}, '', '/contacts/character?sort=bogus:asc');
    render(<App />);
    await screen.findByText('Good Friend');
    expect(screen.getByRole('columnheader', { name: /Standing/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    );
  });
});
