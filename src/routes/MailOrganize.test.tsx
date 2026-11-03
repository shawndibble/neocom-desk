import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db } from '@/db';
import { App } from '@/app/App';
import { CHAR_ID, headers, mailLabels, server, installMailHarness } from '@/test/mailPage';

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

const MAIL = `https://esi.evetech.net/characters/${CHAR_ID}/mail`;

function trackWrites() {
  const puts: { id: string; body: unknown }[] = [];
  const deletes: string[] = [];
  server.use(
    http.put(`${MAIL}/:mailId/`, async ({ request, params }) => {
      puts.push({ id: String(params.mailId), body: await request.json() });
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${MAIL}/:mailId/`, ({ params }) => {
      deletes.push(String(params.mailId));
      return new HttpResponse(null, { status: 204 });
    })
  );
  return { puts, deletes };
}

describe('Mail organize', () => {
  it('marks a read mail unread from its row menu, on ESI and in the list', async () => {
    const { puts } = trackWrites();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Market report');

    await user.click(screen.getByRole('button', { name: 'More actions for Market report' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mark as unread' }));

    await waitFor(() => expect(puts).toEqual([{ id: '2', body: { read: false } }]));
    const row = screen.getByText('Market report').closest('li') as HTMLElement;
    await waitFor(() => expect(within(row).getByText('Unread')).toBeInTheDocument());
    expect((await screen.findAllByText('Marked 1 mail unread')).length).toBeGreaterThan(0);
  });

  it('asks before deleting, and deletes on ESI and from the list', async () => {
    const { deletes } = trackWrites();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Market report');

    await user.click(screen.getByRole('button', { name: 'More actions for Market report' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    expect(await screen.findByText('Delete this mail?')).toBeInTheDocument();
    expect(deletes).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Delete mail' }));

    await waitFor(() => expect(deletes).toEqual(['2']));
    await waitFor(() => expect(screen.queryByText('Market report')).not.toBeInTheDocument());
    expect(screen.getByText('Fleet up!')).toBeInTheDocument();
  });

  it('deletes nothing when the confirm is cancelled', async () => {
    const { deletes } = trackWrites();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Market report');

    await user.click(screen.getByRole('button', { name: 'More actions for Market report' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(deletes).toEqual([]);
    expect(screen.getByText('Market report')).toBeInTheDocument();
  });

  it('keeps the mail and says so when the delete fails', async () => {
    server.use(http.delete(`${MAIL}/:mailId/`, () => new HttpResponse(null, { status: 500 })));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Market report');

    await user.click(screen.getByRole('button', { name: 'More actions for Market report' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    await user.click(await screen.findByRole('button', { name: 'Delete mail' }));

    expect(await screen.findByText(/Couldn't delete/)).toBeInTheDocument();
    expect(screen.getByText('Market report')).toBeInTheDocument();
  });

  it('Select mode: marks only the mail that would change, then deletes the selection once', async () => {
    const { puts, deletes } = trackWrites();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Market report');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByRole('toolbar', { name: 'Selected mail' })).toBeInTheDocument();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select Fleet up!' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Market report' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    // Fleet up! is unread, Market report already read: one write, not two.
    await user.click(screen.getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(puts).toEqual([{ id: '1', body: { read: true } }]));

    await user.click(screen.getByRole('button', { name: 'Delete…' }));
    expect(await screen.findByText('Delete 2 mails?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete 2 mails' }));

    await waitFor(() => expect([...deletes].sort()).toEqual(['1', '2']));
    await waitFor(() => {
      expect(screen.queryByText('Fleet up!')).not.toBeInTheDocument();
      expect(screen.queryByText('Market report')).not.toBeInTheDocument();
    });
  });

  it('shows no Select button and no row menu without the Mail organize Permission', async () => {
    await db.tokens.update(CHAR_ID, { scopes: ['esi-mail.read_mail.v1'] });
    render(<App />);
    await screen.findByText('Market report');

    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More actions for Market report' })
    ).not.toBeInTheDocument();
  });

  it('tags a mail with its Custom Label names, never a System Label', async () => {
    server.use(
      http.get(`${MAIL}`, () =>
        HttpResponse.json([
          { ...headers[0], labels: [3, 32] },
          { ...headers[1], labels: [1, 64, 99] },
        ])
      ),
      http.get(`${MAIL}/labels`, () =>
        HttpResponse.json({
          ...mailLabels,
          labels: [
            ...mailLabels.labels,
            { label_id: 32, name: 'Industry', unread_count: 0 },
            { label_id: 64, name: 'Haulers', unread_count: 0 },
          ],
        })
      )
    );
    render(<App />);
    await screen.findByText('Market report');

    const fleet = screen.getByText('Fleet up!').closest('li') as HTMLElement;
    const market = screen.getByText('Market report').closest('li') as HTMLElement;
    expect(within(fleet).getByText('Industry')).toBeInTheDocument();
    expect(within(market).getByText('Haulers')).toBeInTheDocument();
    // The System Labels (Corp, Inbox) show as the folder, never as a tag; id 99 has no name.
    expect(within(fleet).queryAllByText('Corp').length).toBeLessThanOrEqual(1);
    expect(within(market).queryByText('99')).not.toBeInTheDocument();
  });
});
