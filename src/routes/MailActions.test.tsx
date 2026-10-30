import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { DEFAULT_MAIL_FOLDERS, useMailFolders } from '@/features/character/mailFolderPref';
import { App } from '@/app/App';
import {
  installMailHarness,
  CHAR_ID,
  CHAR_ID_2,
  headers,
  mailLabels,
  server,
  findUndockBody,
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

  it('locally marks a mail read on selection, and can hide read mail', async () => {
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

  it('marks the mail read on ESI too, so it survives a real reload (issue #741)', async () => {
    let capturedBody: unknown;
    let requestCount = 0;
    server.use(
      http.put(`https://esi.evetech.net/characters/${CHAR_ID}/mail/1/`, async ({ request }) => {
        requestCount += 1;
        capturedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Fleet up!'));

    await waitFor(() => expect(requestCount).toBe(1));
    expect(capturedBody).toEqual({ read: true });
  });

  it('offers the mark-as-read Permission and makes no write without organize_mail', async () => {
    await db.tokens.update(CHAR_ID, { scopes: ['esi-mail.read_mail.v1'] });
    let requestCount = 0;
    server.use(
      http.put(`https://esi.evetech.net/characters/${CHAR_ID}/mail/1/`, () => {
        requestCount += 1;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Fleet up!'));

    expect(await screen.findByText('Mail you open stays unread in EVE')).toBeInTheDocument();
    expect(requestCount).toBe(0);
  });

  it('retries the write on every reopen within the session, not only on a fresh page load', async () => {
    // A failed write must get another chance on every reopen, not only once
    // the whole component remounts. `header.is_read` (still `false` here)
    // gates the write, not local session state.
    let requestCount = 0;
    server.use(
      http.put(`https://esi.evetech.net/characters/${CHAR_ID}/mail/1/`, () => {
        requestCount += 1;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Fleet up!'));
    await waitFor(() => expect(requestCount).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await screen.findByText('Fleet up!'));

    await waitFor(() => expect(requestCount).toBe(2));
  });

  it('does not write to ESI for a mail ESI already reports read', async () => {
    let requestCount = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/2`, () =>
        HttpResponse.json({ from: 90000002, subject: 'Market report', body: 'Prices.', read: true })
      ),
      http.put(`https://esi.evetech.net/characters/${CHAR_ID}/mail/2/`, () => {
        requestCount += 1;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    render(<App />);

    // 'Market report' (mail_id 2) is `is_read: true` in the fixture already.
    await user.click(await screen.findByText('Market report'));
    await screen.findByText('Prices.');

    expect(requestCount).toBe(0);
  });

  it('does not block or error the UI when the ESI write fails', async () => {
    server.use(
      http.put(`https://esi.evetech.net/characters/${CHAR_ID}/mail/1/`, () => HttpResponse.error())
    );
    const user = userEvent.setup();
    render(<App />);
    const fleetSubject = await screen.findByText('Fleet up!');
    const fleetRow = fleetSubject.closest('li') as HTMLElement;

    await user.click(fleetSubject);

    expect(await findUndockBody()).toBeInTheDocument();
    expect(within(fleetRow).getByText('Fleet up!')).toHaveClass('font-normal', 'text-text-dim');
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

  it('reading pane "To:" links a character recipient but leaves a mailing list plain (issue #2170)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/lists`, () =>
        HttpResponse.json([{ mailing_list_id: 500, name: 'Fleet Announcements' }])
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json([
          {
            ...headers[0],
            recipients: [
              { recipient_id: 90000003, recipient_type: 'character' },
              { recipient_id: 500, recipient_type: 'mailing_list' },
            ],
          },
          headers[1],
        ])
      ),
      http.get(`https://esi.evetech.net/characters/90000003`, () =>
        HttpResponse.json({
          name: 'Corp Recruiter',
          birthday: '2020-01-01T00:00:00Z',
          bloodline_id: 1,
          gender: 'male',
          race_id: 1,
          security_status: 1.5,
        })
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));

    expect(await screen.findByText(/Fleet Announcements/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fleet Announcements/ })).not.toBeInTheDocument();

    const recipientButton = await screen.findByRole('link', { name: 'Corp Recruiter' });
    await user.click(recipientButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
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
    // Re-queried rather than held: the chip is a different element after a
    // character switch and again after the remount below.
    const sentChip = () =>
      within(screen.getByRole('group', { name: 'Mail folders' })).getByRole('button', {
        name: 'Sent',
      });

    const view = render(<App />);
    await screen.findByText('Fleet up!');
    await user.click(sentChip());
    expect(sentChip()).toHaveAttribute('aria-pressed', 'false');

    // Device-wide, not per character (`mailFolderPref.ts`): switching pilots
    // does not hand back the folder this one just turned off.
    await act(async () => {
      await useActiveCharacter.getState().setActiveCharacter(CHAR_ID_2);
    });
    await screen.findByText('Second pilot mail');
    await waitFor(() => expect(sentChip()).toHaveAttribute('aria-pressed', 'false'));

    // And it is on disk, not just in memory: a fresh store hydrating from
    // Dexie is what a real page reload does.
    expect(await db.settings.get('mailFolders')).toMatchObject({
      value: ['inbox', 'corp', 'alliance'],
    });
    view.unmount();
    useMailFolders.setState({ value: DEFAULT_MAIL_FOLDERS, hydrated: false });
    render(<App />);
    await screen.findByText('Second pilot mail');
    await waitFor(() => expect(sentChip()).toHaveAttribute('aria-pressed', 'false'));
  });

  describe('All characters (issue #2867)', () => {
    const secondLabels = {
      labels: [
        { label_id: 1, name: 'Inbox', unread_count: 4 },
        { label_id: 2, name: 'Sent', unread_count: 0 },
        { label_id: 3, name: 'Corp', unread_count: 0 },
        { label_id: 4, name: 'Alliance', unread_count: 0 },
      ],
      total_unread_count: 4,
    };

    function serveSecondCharacter() {
      server.use(
        http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/mail`, () =>
          HttpResponse.json([
            {
              mail_id: 1,
              from: 90000002,
              subject: 'Second pilot mail',
              timestamp: '2026-08-03T00:00:00Z',
              is_read: false,
              labels: [1],
            },
          ])
        ),
        http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/mail/labels`, () =>
          HttpResponse.json(secondLabels)
        ),
        http.get(`https://esi.evetech.net/characters/${CHAR_ID_2}/mail/1`, () =>
          HttpResponse.json({
            from: 90000002,
            subject: 'Second pilot mail',
            body: 'Body for the second pilot.',
            read: false,
            recipients: [],
          })
        )
      );
    }

    it('merges every Character newest first and tags each row with its owner', async () => {
      await addSecondCharacter();
      serveSecondCharacter();
      window.history.pushState({}, '', '/mail?scope=all');
      render(<App />);
      const second = await screen.findByText('Second pilot mail');
      const first = await screen.findByText('Fleet up!');
      // 08-03 (Pilot Two) sits above 08-02 (Pilot One).
      expect(second.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(
        within(second.closest('li') as HTMLElement).getByRole('img', { name: 'Mail for Pilot Two' })
      ).toBeInTheDocument();
      expect(
        within(first.closest('li') as HTMLElement).getByRole('img', { name: 'Mail for Pilot One' })
      ).toBeInTheDocument();
      expect(within(second.closest('li') as HTMLElement).queryByText('Pilot Two')).toBeNull();
    });

    it('sums each folder chip across Characters and lists unread per Character in the menu', async () => {
      await addSecondCharacter();
      serveSecondCharacter();
      window.history.pushState({}, '', '/mail?scope=all');
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText('Second pilot mail');
      const group = screen.getByRole('group', { name: 'Mail folders' });
      // 1 (Pilot One) + 4 (Pilot Two).
      expect(within(group).getByRole('button', { name: 'Inbox 5 unread' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^All characters/ }));
      expect(await screen.findByText('Pilot One · 3 unread')).toBeInTheDocument();
      expect(screen.getByText('Pilot Two · 4 unread')).toBeInTheDocument();
    });

    it("opens, marks read and replies as the mail's owner", async () => {
      await addSecondCharacter();
      serveSecondCharacter();
      const putUrls: string[] = [];
      server.use(
        http.put('https://esi.evetech.net/characters/:characterId/mail/:mailId/', ({ request }) => {
          putUrls.push(new URL(request.url).pathname);
          return new HttpResponse(null, { status: 204 });
        })
      );
      window.history.pushState({}, '', '/mail?scope=all');
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByText('Second pilot mail'));
      expect(await screen.findByText('Body for the second pilot.')).toBeInTheDocument();
      expect(screen.getByText('For Pilot Two')).toBeInTheDocument();
      await waitFor(() => expect(putUrls).toEqual([`/characters/${CHAR_ID_2}/mail/1/`]));

      // Same `mail_id` 1 in Pilot One's mailbox is a different mail, not a selection twin.
      const ownRow = screen.getByText('Fleet up!').closest('li') as HTMLElement;
      expect(ownRow.querySelector('[aria-current="true"]')).toBeNull();

      const posts: unknown[] = [];
      server.use(
        http.post(`https://esi.evetech.net/characters/${CHAR_ID_2}/mail/`, async ({ request }) => {
          posts.push(await request.json());
          return HttpResponse.json(77);
        })
      );
      await user.click(screen.getByRole('button', { name: 'Reply' }));
      await user.click(await screen.findByRole('button', { name: /^send$/i }));
      await waitFor(() => expect(posts).toHaveLength(1));
    });

    it('names a Character left out on the picker, not in an "N of M" readout', async () => {
      await addSecondCharacter();
      serveSecondCharacter();
      await db.characters.put({
        characterId: 93,
        name: 'Pilot Three',
        ownerHash: 'oh3',
        addedAt: 3,
      });
      await db.tokens.put({
        characterId: 93,
        accessToken: 'a3',
        refreshToken: 'r3',
        expiresAt: Date.now() + 3_600_000,
        scopes: [],
      });
      window.history.pushState({}, '', '/mail?scope=all');
      render(<App />);
      await screen.findByText('Second pilot mail');
      expect(
        screen.getByRole('button', { name: 'All characters · 3. Not included: Pilot Three' })
      ).toBeInTheDocument();
      expect(screen.queryByText(/2 of 3/)).not.toBeInTheDocument();
    });

    it('is unchanged with one Character: no scope control, no owner chips', async () => {
      window.history.pushState({}, '', '/mail?scope=all');
      render(<App />);
      const row = (await screen.findByText('Fleet up!')).closest('li') as HTMLElement;
      expect(screen.queryByRole('button', { name: /characters/i })).not.toBeInTheDocument();
      expect(within(row).queryByText('Pilot One')).not.toBeInTheDocument();
      expect(within(row).queryByRole('img')).not.toBeInTheDocument();
    });
  });
});
