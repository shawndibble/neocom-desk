import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { App } from '@/app/App';
import {
  installMailHarness,
  CHAR_ID,
  CHAR_ID_2,
  headers,
  server,
  findUndockBody,
  useDesktopViewport,
  onlyFolders,
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
  it('lists headers newest first with resolved sender names', async () => {
    render(<App />);
    expect(await screen.findByText('Fleet up!')).toBeInTheDocument();
    expect(await screen.findByText(/Fleet Commander/)).toBeInTheDocument();
    expect(await screen.findByText(/Market Bot/)).toBeInTheDocument();
  });

  it('renders no reading-pane header until a mail is selected, at desktop widths (issue #2104)', async () => {
    // 1024px and 1440px both satisfy the desktop breakpoint (min-width: 64rem)
    // the acceptance criteria are asserted at.
    useDesktopViewport();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Forward' })).not.toBeInTheDocument();
    // Only the page's own top header should exist — the empty reading pane
    // must not render a second, actionless header bar above the empty state.
    expect(document.querySelectorAll('header')).toHaveLength(1);
    expect(screen.getByText('No message open')).toBeInTheDocument();

    await user.click(await screen.findByText('Fleet up!'));
    expect(await screen.findByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forward' })).toBeInTheDocument();
    expect(document.querySelectorAll('header')).toHaveLength(2);
  });

  it('Compose opens the New Mail composer on a phone and closing it returns to the list', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    await user.click(screen.getByRole('button', { name: 'Compose' }));
    expect(await screen.findByRole('dialog', { name: 'New mail' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close and keep draft' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New mail' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Compose' })).toBeInTheDocument();
  });

  it('Compose opens the New Mail composer in the reading pane on a wide screen', async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    const header = document.querySelector('header')!;
    await user.click(within(header).getByRole('button', { name: 'Compose' }));
    expect(await screen.findByRole('region', { name: 'New mail' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compose' })).not.toBeInTheDocument();
  });

  it('offers Compose from the empty reading pane on a wide screen, landing focus in To (issue #3972)', async () => {
    useDesktopViewport();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.getByText('No message open')).toBeInTheDocument();
    expect(screen.getByText('Select a message from the list to read it.')).toBeInTheDocument();
    // Header Compose plus the reading pane's own.
    const buttons = screen.getAllByRole('button', { name: 'Compose' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]!);
    const composer = await screen.findByRole('region', { name: 'New mail' });
    await waitFor(() => expect(within(composer).getByLabelText('To')).toHaveFocus());
    expect(screen.queryByText('No message open')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compose' })).not.toBeInTheDocument();
  });

  it('shows no reading-pane placeholder and one Compose on a phone (issue #3972)', async () => {
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.queryByText('No message open')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Compose' })).toHaveLength(1);
  });

  it('shows the body, markup rendered, on click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));
    expect(await findUndockBody()).toBeInTheDocument();
    // `<b>now</b>` renders as bold, not as literal tags.
    expect(screen.getByText('now').tagName).toBe('STRONG');
  });

  it('?open= opens that mail in the reader and strips the params (issue #5372)', async () => {
    useDesktopViewport();
    window.history.pushState({}, '', `/mail?open=1&owner=${CHAR_ID}`);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Fleet up!' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('?open= for a mail not in the mailbox opens nothing', async () => {
    useDesktopViewport();
    window.history.pushState({}, '', `/mail?open=1&owner=${CHAR_ID_2}`);
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.getByText('No message open')).toBeInTheDocument();
  });

  it('focuses the reader heading on open, and the mail row on Back (issue #1485)', async () => {
    const user = userEvent.setup();
    render(<App />);
    const subjectText = await screen.findByText('Fleet up!');
    const rowButton = subjectText.closest('button');
    expect(rowButton).not.toBeNull();

    await user.click(rowButton as HTMLButtonElement);
    const readerHeading = await screen.findByRole('heading', { name: 'Fleet up!' });
    await waitFor(() => expect(readerHeading).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(rowButton).toHaveFocus());
  });

  it('opening Reply focuses the compose box, and Cancel returns focus to the Reply button (issue #1485)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));

    await user.click(await screen.findByRole('button', { name: 'Reply' }));

    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    // The Reply button unmounts while composing and remounts fresh once
    // Cancel closes it — re-query rather than reusing the pre-compose element.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toHaveFocus());
  });

  it('Reply opened before the body loads still focuses the compose box, not the reader heading', async () => {
    // Reply renders from the header alone, so a quick pilot can open it while
    // the body is still loading — the reader heading's focus-on-load must not
    // then take focus from the compose box that mounts alongside it.
    let releaseBody: () => void = () => {};
    const bodyGate = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/1`, async () => {
        await bodyGate;
        return HttpResponse.json({
          from: 90000001,
          subject: 'Fleet up!',
          body: 'Undock <b>now</b>.',
          read: false,
          recipients: [{ recipient_id: 90000003, recipient_type: 'character' }],
        });
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));
    await user.click(await screen.findByRole('button', { name: 'Reply' }));

    // The compose box mounts with the body, on the same commit as the
    // reader heading the body's arrival would otherwise focus.
    releaseBody();
    expect(await findUndockBody()).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveFocus());
  });

  it('reading pane sender name opens the shared Public Info Modal (issue #787)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/90000001`, () =>
        HttpResponse.json({
          name: 'Fleet Commander',
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
    const senderButton = await screen.findByRole('link', { name: 'Fleet Commander' });
    await user.click(senderButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
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

  it('keeps the saved mail on screen, with a small log-in note, when the mail grant lapsed over it', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: headers,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to refresh.')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your mail')).not.toBeInTheDocument();
    expect(await screen.findByText('Fleet up!')).toBeInTheDocument();
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

  it('says no mail matched, not "no mail cached", and Clear search brings the list back', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    const search = screen.getByRole('searchbox', { name: /search/i });
    await user.type(search, 'zzzznotamatch');
    expect(await screen.findByText('No mail matches your search')).toBeInTheDocument();
    expect(screen.queryByText('No mail cached')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('Fleet up!')).toBeInTheDocument();
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
  });

  /** Turns every folder chip off except `keep`. */
  it('says a folder is empty, with no action, when it holds no mail (issue #3972)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    await onlyFolders(user, ['Sent']);
    expect(await screen.findByText('No mail in this folder')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show read mail' })).not.toBeInTheDocument();
  });

  it('says an empty folder holds no saved mail when showing cached data (issue #3972)', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'mail:headers',
      value: headers,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () => HttpResponse.error())
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    await onlyFolders(user, ['Sent']);
    expect(await screen.findByText('No saved mail in this folder')).toBeInTheDocument();
  });

  it('offers Show read mail when Hide read hid everything (issue #3972)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    // Inbox holds only the read "Market report".
    await onlyFolders(user, ['Inbox']);
    await user.click(screen.getByRole('button', { name: 'Hide read' }));
    expect(await screen.findByText('No unread mail')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show read mail' }));
    expect(await screen.findByText('Market report')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search/i })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Hide read' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('offers Clear search, not Show read mail, when the search alone empties the list', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Fleet up!');
    await user.click(screen.getByRole('button', { name: 'Hide read' }));
    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'zzzznotamatch');
    expect(await screen.findByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show read mail' })).not.toBeInTheDocument();
  });

  it('keeps search and hide-read in the URL, and restores them on a fresh visit', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await screen.findByText('Fleet up!');

    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'fleet');
    await waitFor(() => expect(window.location.search).toContain('search=fleet'));
    await user.click(screen.getByRole('button', { name: 'Hide read' }));
    await waitFor(() => expect(window.location.search).toContain('hideRead=1'));
    expect(screen.queryByText('Market report')).not.toBeInTheDocument();

    unmount();
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.getByRole('searchbox', { name: /search/i })).toHaveValue('fleet');
    expect(screen.getByRole('button', { name: 'Hide read' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText('Market report')).not.toBeInTheDocument();
  });

  it('applies a restored search filter as soon as data loads, without an unfiltered flash', async () => {
    window.history.pushState({}, '', '/mail?search=market');
    render(<App />);
    await screen.findByText('Market report');
    expect(screen.queryByText('Fleet up!')).not.toBeInTheDocument();
  });

  it('omits default search/hide-read from the URL and ignores a garbage hideRead value', async () => {
    window.history.pushState({}, '', '/mail?hideRead=garbage');
    render(<App />);
    await screen.findByText('Fleet up!');
    expect(screen.getByRole('button', { name: 'Hide read' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByText('Market report')).toBeInTheDocument();
    expect(window.location.search).not.toContain('search=');
  });

  it('gives a row its folder and unread state in words, not colour alone', async () => {
    render(<App />);
    await screen.findByText('Fleet up!');
    // 'Fleet up!' is corp + unread; 'Market report' is inbox + read.
    expect(screen.getByRole('button', { name: /^Fleet up!.*Corp.*Unread/s })).toBeInTheDocument();
    const read = screen.getByRole('button', { name: /^Market report/s });
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
    const row = await screen.findByRole('button', { name: /^Contract terms/s });
    expect(row).toHaveTextContent('Corp Recruiter');
    expect(row).not.toHaveTextContent('Fleet Commander');

    // More than one recipient collapses to the first plus a count — a row has
    // one line for them.
    expect(screen.getByRole('button', { name: /^Fleet doctrine/s })).toHaveTextContent(
      'Corp Recruiter +1 more'
    );
  });

  it('shows a resolved "To:" line in the reading pane', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Fleet up!'));
    expect(await screen.findByText(/Corp Recruiter/)).toBeInTheDocument();
  });
});
