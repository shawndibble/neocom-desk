import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { App } from '@/app/App';
import {
  installMailHarness,
  CHAR_ID,
  CHAR_ID_2,
  headers,
  mailLabels,
  server,
  findUndockBody,
  onlyFolders,
  addSecondCharacter,
} from '@/test/mailPage';

vi.mock('@/features/character/mailEditor/RichMailBodyEditor', async () => ({
  default: (await import('@/features/character/PlainBodyEditor.testHelper')).PlainBodyEditor,
}));

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

installMailHarness();

describe('Mail', () => {
  describe('Contact standing cross-reference', () => {
    it('shows a standing tag next to a personally-blocked sender', async () => {
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () =>
          HttpResponse.json([
            { contact_id: 90000001, contact_type: 'character', standing: -10, is_blocked: true },
          ])
        )
      );
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByText('Fleet up!'));
      expect(
        await screen.findByRole('img', { name: 'Your contact: Terrible standing (-10)' })
      ).toBeInTheDocument();
    });

    it('shows no tag for a sender who is a stranger', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByText('Fleet up!'));
      await screen.findByText(/Corp Recruiter/);
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it("inherits the sender's corp entry when the sender has no personal contact of their own", async () => {
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () =>
          HttpResponse.json([{ contact_id: 99, contact_type: 'corporation', standing: -10 }])
        ),
        http.post('https://esi.evetech.net/characters/affiliation', () =>
          HttpResponse.json([{ character_id: 90000001, corporation_id: 99 }])
        )
      );
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByText('Fleet up!'));
      expect(
        await screen.findByRole('img', {
          name: 'Terrible standing (-10) — your entry on their corp, not on them',
        })
      ).toBeInTheDocument();
    });
  });

  it('sends only character senders to the affiliation lookup', async () => {
    let sent: number[] = [];
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([
          {
            mail_id: 1,
            from: 90000001,
            subject: 'Fleet up!',
            timestamp: '2026-08-01T00:00:00Z',
            is_read: true,
            labels: [],
          },
          {
            mail_id: 2,
            from: 1000125,
            subject: 'From a corp',
            timestamp: '2026-08-02T00:00:00Z',
            is_read: true,
            labels: [],
          },
        ])
      ),
      http.post('https://esi.evetech.net/universe/names', () =>
        HttpResponse.json([
          { id: 90000001, name: 'Fleet Commander', category: 'character' },
          { id: 1000125, name: 'Some Corp', category: 'corporation' },
        ])
      ),
      http.post('https://esi.evetech.net/characters/affiliation', async ({ request }) => {
        sent = (await request.json()) as number[];
        return HttpResponse.json([]);
      })
    );
    render(<App />);
    await screen.findByText('From a corp');
    await vi.waitFor(() => expect(sent).toEqual([90000001]));
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
    // The scroller wraps the date sections, each its own <ul>.
    const list = screen.getByText('Mail 0').closest('.overflow-y-auto');
    expect(list).toHaveClass('max-h-[36rem]');
  });

  it('groups the list under date headings without breaking row selection (issue #3971)', async () => {
    // Only Date is faked: real timers keep findBy/waitFor polling. Local noon,
    // so the 09:00 mail is Today in any runner zone.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 2, 12));
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([
          { ...headers[0], timestamp: new Date(2026, 7, 2, 9).toISOString() },
          { ...headers[1], timestamp: '2020-03-15T12:00:00Z' },
        ])
      )
    );
    const user = userEvent.setup();
    render(<App />);
    const subject = await screen.findByText('Fleet up!');
    const today = screen.getByRole('heading', { name: 'Today' });
    // Device locale, like every other date in the app.
    const marchLabel = new Date(Date.UTC(2020, 2, 15)).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const march = screen.getByRole('heading', { name: marchLabel });
    expect(today.compareDocumentPosition(march) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Today' })).toHaveLength(1);

    await user.click(subject);
    expect(await screen.findByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(subject.closest('[aria-current]')).toHaveAttribute('aria-current', 'true');
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

    expect(await screen.findByText('Older mail', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(lastMailIdParam).toBe('951');
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('says only recent mail is empty, pointing at Load more, while older pages are unloaded', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      mail_id: 1000 - i,
      subject: `Mail ${1000 - i}`,
      timestamp: '2026-08-05T00:00:00Z',
      labels: [],
    }));
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json(fullPage)
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mail 1000');
    await onlyFolders(user, ['Sent']);
    expect(await screen.findByText('No recent mail in this folder')).toBeInTheDocument();
    expect(screen.queryByText('No mail in this folder')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  it('says it is offline when "load more" cannot reach ESI, and keeps the button to try again', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      mail_id: 1000 - i,
      subject: `Mail ${1000 - i}`,
      timestamp: '2026-08-05T00:00:00Z',
      labels: [],
    }));
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, ({ request }) =>
        new URL(request.url).searchParams.get('last_mail_id') === null
          ? HttpResponse.json(fullPage)
          : HttpResponse.error()
      )
    );

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mail 1000');
    await user.click(screen.getByRole('button', { name: /load more/i }));

    expect(
      await screen.findByText("Couldn't load more — you're offline.", {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load more/i })).toBeEnabled();
  });

  it('says an unopened mail has not been downloaded when it cannot be fetched, and retries', async () => {
    let fail = true;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/1`, () =>
        fail
          ? HttpResponse.error()
          : HttpResponse.json({
              from: 90000001,
              subject: 'Fleet up!',
              body: 'Undock <b>now</b>.',
              read: false,
              recipients: [],
              labels: [],
            })
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));

    expect(await screen.findByText("This mail hasn't been downloaded yet.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await findUndockBody()).toBeInTheDocument();
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

    const olderRow = (await screen.findByText('Older mail', {}, { timeout: 5000 })).closest('li');
    expect(olderRow).toHaveTextContent('Market Bot');
  });

  it('resolves standing for mail fetched by "load more" too, including an inherited corp entry', async () => {
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
      }),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json([{ contact_id: 77, contact_type: 'corporation', standing: -10 }])
      ),
      http.post('https://esi.evetech.net/characters/affiliation', () =>
        HttpResponse.json([{ character_id: 90000002, corporation_id: 77 }])
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/5`, () =>
        HttpResponse.json({ from: 90000002, subject: 'Older mail', body: 'Hi.', read: false })
      )
    );

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mail 1000');
    await user.click(screen.getByRole('button', { name: /load more/i }));
    await user.click(await screen.findByText('Older mail', {}, { timeout: 5000 }));

    expect(
      await screen.findByRole('img', {
        name: 'Terrible standing (-10) — your entry on their corp, not on them',
      })
    ).toBeInTheDocument();
  });

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
});
