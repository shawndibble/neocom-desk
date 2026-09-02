import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
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
      fetchedAt: Date.now(),
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

  it('shows an All/Inbox/Corp/Alliance/Sent tab bar with unread badges from /mail/labels', async () => {
    render(<App />);
    const tablist = await screen.findByRole('tablist', { name: 'Mail folders' });
    expect(tablist).toBeInTheDocument();
    const allTab = tablist.querySelector('[data-tab-id="all"]') as HTMLElement;
    expect(allTab).toHaveTextContent('3'); // total_unread_count
    const corpTab = tablist.querySelector('[data-tab-id="corp"]') as HTMLElement;
    expect(corpTab).toHaveTextContent('2');
    const sentTab = tablist.querySelector('[data-tab-id="sent"]') as HTMLElement;
    expect(sentTab).not.toHaveTextContent(/\d/);
  });

  it('filters the list to the selected tab, folding an uncategorized header into Inbox', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.getByText('Market report')).toBeInTheDocument();

    const tablist = screen.getByRole('tablist', { name: 'Mail folders' });
    await user.click(tablist.querySelector('[data-tab-id="corp"]') as HTMLElement);
    expect(screen.getByText('Fleet up!')).toBeInTheDocument();
    expect(screen.queryByText('Market report')).not.toBeInTheDocument();

    await user.click(tablist.querySelector('[data-tab-id="inbox"]') as HTMLElement);
    expect(screen.queryByText('Fleet up!')).not.toBeInTheDocument();
    expect(screen.getByText('Market report')).toBeInTheDocument();
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
    expect(list).toHaveClass('max-h-[32rem]', 'overflow-y-auto');
  });

  it('does not show a custom-label filter when the character has none', async () => {
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.queryByRole('group', { name: /labels/i })).not.toBeInTheDocument();
  });

  it('shows custom labels as filter chips, distinct from the system-label tabs, and filters on toggle', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/labels`, () =>
        HttpResponse.json({
          labels: [...mailLabels.labels, { label_id: 100, name: 'Miners', unread_count: 0 }],
          total_unread_count: 3,
        })
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([...headers, { mail_id: 3, subject: 'Ore report', labels: [100] }])
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.getByText('Ore report')).toBeInTheDocument();

    const group = screen.getByRole('group', { name: /labels/i });
    expect(group.querySelector('[aria-pressed="false"]')).toHaveTextContent('Miners');

    await user.click(screen.getByRole('button', { name: 'Miners' }));
    expect(screen.getByText('Ore report')).toBeInTheDocument();
    expect(screen.queryByText('Fleet up!')).not.toBeInTheDocument();
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
});
