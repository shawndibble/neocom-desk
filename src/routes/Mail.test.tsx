import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { DEFAULT_MAIL_FOLDERS, useMailFolders } from '@/features/character/mailFolderPref';
import { App } from '@/app/App';

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
}));

const CHAR_ID = 91;
const CHAR_ID_2 = 92;

const headers = [
  {
    mail_id: 1,
    from: 90000001,
    subject: 'Fleet up!',
    timestamp: '2026-08-02T00:00:00Z',
    is_read: false,
    labels: [3],
    recipients: [{ recipient_id: 90000003, recipient_type: 'character' }],
  },
  {
    mail_id: 2,
    from: 90000002,
    subject: 'Market report',
    timestamp: '2026-08-01T00:00:00Z',
    is_read: true,
    labels: [],
  },
];

const mailLabels = {
  labels: [
    { label_id: 1, name: 'Inbox', unread_count: 1 },
    { label_id: 2, name: 'Sent', unread_count: 0 },
    { label_id: 3, name: 'Corp', unread_count: 2 },
    { label_id: 4, name: 'Alliance', unread_count: 0 },
  ],
  total_unread_count: 3,
};

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () => HttpResponse.json(headers)),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/labels`, () =>
    HttpResponse.json(mailLabels)
  ),
  http.get('https://esi.evetech.net/characters/:characterId/mail/lists', () =>
    HttpResponse.json([])
  ),
  http.post('https://esi.evetech.net/universe/names', () =>
    HttpResponse.json([
      { id: 90000001, name: 'Fleet Commander', category: 'character' },
      { id: 90000002, name: 'Market Bot', category: 'character' },
      { id: 90000003, name: 'Corp Recruiter', category: 'character' },
    ])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/1`, () =>
    HttpResponse.json({
      from: 90000001,
      subject: 'Fleet up!',
      body: 'Undock <b>now</b>.',
      read: false,
      recipients: [{ recipient_id: 90000003, recipient_type: 'character' }],
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  // Module-scoped store: without this the folder selection one test makes
  // leaks into the next, and `hydrate` short-circuits on `hydrated`.
  useMailFolders.setState({ value: DEFAULT_MAIL_FOLDERS, hydrated: false });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-mail.read_mail.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/mail');
});

describe('Mail', () => {
  it('lists headers newest first with resolved sender names', async () => {
    render(<App />);
    expect(await screen.findByText('Fleet up!')).toBeInTheDocument();
    expect(await screen.findByText(/Fleet Commander/)).toBeInTheDocument();
    expect(await screen.findByText(/Market Bot/)).toBeInTheDocument();
  });

  it('shows the body, markup stripped, on click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));
    expect(await screen.findByText('Undock now.')).toBeInTheDocument();
  });

  it('falls back to cached headers offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: headers,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText('Fleet up!')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/no mail cached/i)).toBeInTheDocument();
  });

  it('falls back to the unknown-sender label when a header has no sender', async () => {
    // `cond && map.get(x) ?? fallback` yields `false` for a missing sender,
    // and React renders `false` as nothing — the label never appeared.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([
          { mail_id: 3, subject: 'From nobody', timestamp: '2026-08-03T00:00:00Z', labels: [] },
        ])
      )
    );

    render(<App />);

    expect(await screen.findByText(/From nobody/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown sender/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the mail scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your mail')).toBeInTheDocument();
    expect(screen.queryByText(/no mail cached/i)).not.toBeInTheDocument();
  });

  it('shows an Inbox/Corp/Alliance/Sent toggle group, all on, with unread counts from /mail/labels', async () => {
    render(<App />);
    const group = await screen.findByRole('group', { name: 'Mail folders' });
    // No synthetic "All": every folder selected is what All used to mean.
    expect(within(group).getAllByRole('button')).toHaveLength(4);
    // The count reads as "2 unread" rather than a bare "2", and a folder with
    // nothing unread carries no number at all — Sent reports zero forever, so
    // dimming or badging it would be permanent noise.
    for (const name of ['Inbox 1 unread', 'Corp 2 unread', 'Alliance', 'Sent']) {
      expect(within(group).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    // The figure is still on screen for everyone else.
    expect(within(group).getByRole('button', { name: /^Corp/ })).toHaveTextContent('2');
  });

  it('keeps several folders on at once, folding an uncategorized header into Inbox', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!'); // corp
    expect(screen.getByText('Market report')).toBeInTheDocument(); // no labels -> inbox

    const group = screen.getByRole('group', { name: 'Mail folders' });
    const inbox = within(group).getByRole('button', { name: /^Inbox/ });

    // Turning one folder off leaves every other folder on — the whole point of
    // toggles over tabs.
    await user.click(inbox);
    expect(inbox).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Fleet up!')).toBeInTheDocument();
    expect(screen.queryByText('Market report')).not.toBeInTheDocument();

    await user.click(inbox);
    expect(inbox).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Market report')).toBeInTheDocument();
  });

  it('explains an empty folder selection and offers the way back, keeping the chips on screen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    const group = screen.getByRole('group', { name: 'Mail folders' });
    for (const chip of within(group).getAllByRole('button')) await user.click(chip);

    expect(screen.getByText('No folders selected')).toBeInTheDocument();
    expect(screen.queryByText('Fleet up!')).not.toBeInTheDocument();
    // The controls that undo this must not vanish with the rows.
    expect(within(group).getAllByRole('button')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Show all folders' }));
    expect(await screen.findByText('Fleet up!')).toBeInTheDocument();
  });

  it('says no mail matched, not "no mail cached", when a filter empties the list', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'zzzznotamatch');
    expect(await screen.findByText('No mail matches these filters')).toBeInTheDocument();
    expect(screen.queryByText('No mail cached')).not.toBeInTheDocument();
  });

  it('gives a row its folder and unread state in words, not colour alone', async () => {
    render(<App />);
    await screen.findByText('Fleet up!');
    // 'Fleet up!' is corp + unread; 'Market report' is inbox + read.
    expect(screen.getByRole('button', { name: /Fleet up!.*Corp.*Unread/s })).toBeInTheDocument();
    const read = screen.getByRole('button', { name: /Market report/s });
    expect(read).toHaveAccessibleName(expect.stringContaining('Inbox'));
    expect(read.textContent).not.toMatch(/Unread/);
  });

  it("shows a sent mail's recipient rather than the pilot's own name", async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([
          {
            mail_id: 7,
            from: 90000001,
            subject: 'Contract terms',
            timestamp: '2026-08-04T00:00:00Z',
            is_read: true,
            labels: [2], // Sent
            recipients: [{ recipient_id: 90000003, recipient_type: 'character' }],
          },
          {
            mail_id: 8,
            from: 90000001,
            subject: 'Fleet doctrine',
            timestamp: '2026-08-05T00:00:00Z',
            is_read: true,
            labels: [2], // Sent
            recipients: [
              { recipient_id: 90000003, recipient_type: 'character' },
              { recipient_id: 90000002, recipient_type: 'character' },
            ],
          },
        ])
      )
    );
    render(<App />);
    const row = await screen.findByRole('button', { name: /Contract terms/s });
    expect(row).toHaveTextContent('Corp Recruiter');
    expect(row).not.toHaveTextContent('Fleet Commander');

    // More than one recipient collapses to the first plus a count — a row has
    // one line for them.
    expect(screen.getByRole('button', { name: /Fleet doctrine/s })).toHaveTextContent(
      'Corp Recruiter +1 more'
    );
  });

  it('shows a resolved "To:" line in the reading pane', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));
    expect(await screen.findByText(/Corp Recruiter/)).toBeInTheDocument();
  });

  it('does not render an Export CSV button', async () => {
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
  });

  it('keeps the list pane bounded and independently scrollable with many cached headers', async () => {
    const manyHeaders = Array.from({ length: 35 }, (_, i) => ({
      mail_id: 100 + i,
      from: 90000001,
      subject: `Mail ${i}`,
      timestamp: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      is_read: true,
      labels: [],
    }));
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json(manyHeaders)
      )
    );
    render(<App />);
    await screen.findByText('Mail 0');
    const list = screen.getByText('Mail 0').closest('ul');
    expect(list).toHaveClass('max-h-[36rem]', 'overflow-y-auto');
  });

  it('does not show a "load more" affordance when fewer than 50 mails are cached', async () => {
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('shows "load more" at the 50-cap, fetches older mail via last_mail_id, and hides it once exhausted', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      mail_id: 1000 - i,
      subject: `Mail ${1000 - i}`,
      timestamp: '2026-08-05T00:00:00Z',
      labels: [],
    }));
    let lastMailIdParam: string | null = null;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, ({ request }) => {
        const param = new URL(request.url).searchParams.get('last_mail_id');
        if (param === null) return HttpResponse.json(fullPage);
        lastMailIdParam = param;
        return HttpResponse.json([{ mail_id: 5, subject: 'Older mail', labels: [] }]);
      })
    );

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mail 1000');

    const loadMore = screen.getByRole('button', { name: /load more/i });
    await user.click(loadMore);

    expect(await screen.findByText('Older mail')).toBeInTheDocument();
    expect(lastMailIdParam).toBe('951');
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('resolves sender names for mail fetched by "load more", not just the first page', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      mail_id: 1000 - i,
      from: 90000001,
      subject: `Mail ${1000 - i}`,
      timestamp: '2026-08-05T00:00:00Z',
      labels: [],
    }));
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, ({ request }) => {
        const param = new URL(request.url).searchParams.get('last_mail_id');
        if (param === null) return HttpResponse.json(fullPage);
        return HttpResponse.json([
          { mail_id: 5, from: 90000002, subject: 'Older mail', labels: [] },
        ]);
      })
    );

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mail 1000');
    await user.click(screen.getByRole('button', { name: /load more/i }));

    const olderRow = (await screen.findByText('Older mail')).closest('li');
    expect(olderRow).toHaveTextContent('Market Bot');
  });

  async function addSecondCharacter() {
    await db.characters.put({
      characterId: CHAR_ID_2,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
    });
    await db.tokens.put({
      characterId: CHAR_ID_2,
      accessToken: 'access-token-2',
      refreshToken: 'refresh-2',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-mail.read_mail.v1'],
    });
  }

  it('discards a "load more" result that resolves after the character changes', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      mail_id: 1000 - i,
      subject: `Mail ${1000 - i}`,
      timestamp: '2026-08-05T00:00:00Z',
      labels: [],
    }));
    let resolveOlderPage: (() => void) | null = null;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, async ({ request }) => {
        const param = new URL(request.url).searchParams.get('last_mail_id');
        if (param === null) return HttpResponse.json(fullPage);
        await new Promise<void>((resolve) => {
          resolveOlderPage = resolve;
        });
        return HttpResponse.json([{ mail_id: 5, subject: 'Older mail', labels: [] }]);
      })
    );
    await addSecondCharacter();
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/mail`, () =>
        HttpResponse.json([
          { mail_id: 4, subject: 'Second pilot mail', timestamp: '2026-08-03T00:00:00Z' },
        ])
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/mail/labels`, () =>
        HttpResponse.json({ labels: mailLabels.labels, total_unread_count: 0 })
      )
    );

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mail 1000');
    await user.click(screen.getByRole('button', { name: /load more/i }));

    await act(async () => {
      await useActiveCharacter.getState().setActiveCharacter(CHAR_ID_2);
    });
    await screen.findByText('Second pilot mail');

    await act(async () => {
      resolveOlderPage?.();
      // Let the stale fetch's response parsing, resolveNames, and any state
      // updates it triggers fully settle across several microtask/macrotask
      // hops before asserting on the result.
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    expect(screen.queryByText('Older mail')).not.toBeInTheDocument();
    expect(screen.getByText('Second pilot mail')).toBeInTheDocument();
  });

  it('filters headers by a subject/sender search box', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.getByText('Market report')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search subject or sender'), 'fleet');
    await waitFor(() => expect(screen.queryByText('Market report')).not.toBeInTheDocument());
    expect(screen.getByText('Fleet up!')).toBeInTheDocument();
  });

  it('matches search against the resolved sender name, not just the subject', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');

    await user.type(screen.getByLabelText('Search subject or sender'), 'market bot');
    await waitFor(() => expect(screen.queryByText('Fleet up!')).not.toBeInTheDocument());
    expect(screen.getByText('Market report')).toBeInTheDocument();
  });

  it('locally marks a mail read on selection without writing back to ESI, and can hide read mail', async () => {
    const user = userEvent.setup();
    render(<App />);
    const fleetSubject = await screen.findByText('Fleet up!');
    const fleetRow = fleetSubject.closest('li') as HTMLElement;
    expect(within(fleetRow).getByText('Fleet up!')).toHaveClass('font-semibold', 'text-text');

    await user.click(fleetSubject);
    expect(within(fleetRow).getByText('Fleet up!')).toHaveClass('font-normal', 'text-text-dim');

    // Mobile layout shows one pane at a time — back to the list to reach the filter row.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Hide read' }));
    expect(screen.queryByText('Fleet up!')).not.toBeInTheDocument();
    // The already-read fixture header ('Market report') is also hidden now.
    expect(screen.queryByText('Market report')).not.toBeInTheDocument();
  });

  it("resolves a mailing list's real name instead of the generic fallback", async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/lists`, () =>
        HttpResponse.json([{ mailing_list_id: 500, name: 'Fleet Announcements' }])
      ),
      // The reading pane's recipients come from the header list, not the body.
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([
          { ...headers[0], recipients: [{ recipient_id: 500, recipient_type: 'mailing_list' }] },
          headers[1],
        ])
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));
    expect(await screen.findByText(/Fleet Announcements/)).toBeInTheDocument();
  });

  it('falls back to the generic label for a mailing list with no resolved name', async () => {
    server.use(
      // No /mail/lists override — the default handler returns `[]`.
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([
          { ...headers[0], recipients: [{ recipient_id: 999, recipient_type: 'mailing_list' }] },
          headers[1],
        ])
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));
    expect(await screen.findByText(/Mailing list/)).toBeInTheDocument();
  });

  it('remembers the folder selection across a character switch and a reload', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([...headers, { mail_id: 3, subject: 'Ore report', labels: [100] }])
      )
    );
    await addSecondCharacter();
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/mail`, () =>
        HttpResponse.json([
          { mail_id: 4, subject: 'Second pilot mail', timestamp: '2026-08-03T00:00:00Z' },
        ])
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/mail/labels`, () =>
        HttpResponse.json({ labels: mailLabels.labels, total_unread_count: 0 })
      )
    );

    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByText('Fleet up!');
    const sentChip = within(screen.getByRole('group', { name: 'Mail folders' })).getByRole(
      'button',
      { name: 'Sent' }
    );
    await user.click(sentChip);
    expect(sentChip).toHaveAttribute('aria-pressed', 'false');

    // Device-wide, not per character (`mailFolderPref.ts`): switching pilots
    // does not hand back the folder this one just turned off.
    await act(async () => {
      await useActiveCharacter.getState().setActiveCharacter(CHAR_ID_2);
    });
    await screen.findByText('Second pilot mail');
    await waitFor(() =>
      expect(
        within(screen.getByRole('group', { name: 'Mail folders' })).getByRole('button', {
          name: 'Sent',
        })
      ).toHaveAttribute('aria-pressed', 'false')
    );

    // And it is on disk, not just in memory: a fresh store hydrating from
    // Dexie is what a real page reload does.
    expect(await db.settings.get('mailFolders')).toMatchObject({
      value: ['inbox', 'corp', 'alliance'],
    });
    view.unmount();
    useMailFolders.setState({ value: DEFAULT_MAIL_FOLDERS, hydrated: false });
    render(<App />);
    await screen.findByText('Second pilot mail');
    await waitFor(() =>
      expect(
        within(screen.getByRole('group', { name: 'Mail folders' })).getByRole('button', {
          name: 'Sent',
        })
      ).toHaveAttribute('aria-pressed', 'false')
    );
  });
});
