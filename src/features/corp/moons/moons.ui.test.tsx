import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { LocationProbe } from '@/test/LocationProbe';
import { stubViewport } from '@/test/viewport';
import { BELOW_DESKTOP_QUERY } from '@/lib/useIsBelowDesktop';
import { buildBookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import { draftNotice } from '@/engine/corpTaxBook/lateNotices';
import { DEFAULT_NOTICE_RULES } from '@/engine/corpTaxBook/notices';
import type { ObservedMiningEntry } from '@/engine/corpTaxBook/types';
import { BookProvider } from './BookContext';
import { MinersTab } from './MinersTab';
import { BookTotals, OverdueAging } from './BookTotals';
import { MINERS_COLUMN_IDS, useVisibleMinersColumns } from './moonsColumns';
import { LateNoticeRun } from './LateNoticeRun';
import { MarkNotTaxDialog } from './BookDialogs';
import type { BookSettings, OfficerVerdict } from '../taxBook/bookClient';

const editBook = vi.fn();
const enqueueLateNotices = vi.fn();
vi.mock('../taxBook/bookClient', () => ({
  editBook: (...a: unknown[]) => editBook(...a),
  issueLateNotice: (character: number, corp: number, notice: unknown) =>
    editBook(character, corp, { action: 'issueLateNotice', notice }),
  readAudit: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/corpTaxBook/mailQueue', () => ({
  enqueueLateNotices: (...a: unknown[]) => enqueueLateNotices(...a),
  enqueueReminder: vi.fn(),
}));

// The rich editor is its own chunk (Tiptap); a plain field stands in for it here.
vi.mock('@/features/character/MailBodyEditor', async () => {
  const { TextArea } = await import('@/components/ui');
  return {
    MailBodyEditor: (props: { id: string; value: string; onChange: (v: string) => void }) => (
      <TextArea
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    ),
  };
});

const corpName = vi.hoisted(() => ({ value: 'Ore & Glory' as string | null }));
vi.mock('@/features/character/useEntityName', () => ({
  useEntityName: () => corpName.value,
}));

const CORP = 98000001;
const ORE = 45490;
const entry = (
  characterId: number,
  date: string,
  quantity: number,
  corp = CORP
): ObservedMiningEntry => ({
  characterId,
  recordedCorporationId: corp,
  structureId: 1001,
  date,
  oreLines: [{ typeId: ORE, quantity }],
});

function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-09-18T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    overdueDays: 14,
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [entry(1, '2026-08-10', 1000), entry(2, '2026-08-11', 2000, 555)],
    miners: [],
    notices: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    pricesOn: () => ({ prices: new Map([[ORE, 1000]]), sources: new Map() }),
    ...overrides,
  };
}

const verdict: OfficerVerdict = {
  corporationId: CORP,
  isCeo: false,
  isDirector: false,
  isStationManager: false,
  canView: true,
  canEdit: true,
  bookActive: true,
  expiresAt: 0,
};

function renderBook(
  ui: ReactElement,
  overrides: Partial<BookViewInput> = {},
  path = '/corp/moons/miners'
) {
  const view = buildBookView(input(overrides));
  const reload = vi.fn();
  const { unmount } = render(
    <MemoryRouter initialEntries={[path]}>
      <BookProvider
        value={{
          characterId: 7,
          corporationId: CORP,
          view,
          names: {
            character: (id) => `Pilot ${id}`,
            corporation: (id) => `Corp ${id}`,
            refinery: () => 'Efa - Brass Anvil',
            ownerRefinery: () => 'Efa - Brass Anvil',
            moon: (id) => `Moon ${id}`,
            ore: () => 'Sylvite',
          },
          settings: { noticeRules: DEFAULT_NOTICE_RULES } as BookSettings,
          data: {} as never,
          verdict,
          reload,
        }}
      >
        {ui}
      </BookProvider>
    </MemoryRouter>
  );
  return { view, reload, unmount };
}

beforeEach(() => {
  useVisibleMinersColumns.setState({ value: MINERS_COLUMN_IDS, hydrated: false });
  corpName.value = 'Ore & Glory';
  editBook.mockReset().mockResolvedValue({});
  enqueueLateNotices.mockReset().mockResolvedValue({ queued: 1, skipped: 0, missingLink: [] });
});

describe('MinersTab', () => {
  it('lists members and non-members by default; turning Non-members off says what is hidden (CX-36)', async () => {
    renderBook(<MinersTab />);
    const table = screen.getByRole('table', { name: 'Miners' });
    expect(within(table).getByText('Pilot 1')).toBeInTheDocument();
    expect(within(table).getByText('Pilot 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await userEvent.click(await screen.findByRole('button', { name: /Non-members/ }));
    expect(within(table).queryByText('Pilot 2')).not.toBeInTheDocument();
    expect(screen.getByText(/1 non-member hidden · .* owed/)).toBeInTheDocument();
  });

  it('one filter row: search, Columns and the funnel; the standing chips sit behind the funnel (§4b)', async () => {
    renderBook(<MinersTab />);
    expect(screen.getByRole('searchbox', { name: 'Search Miners' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Columns' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Non-members/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const group = await screen.findByRole('group', { name: 'In corp' });
    expect(within(group).getByRole('button', { name: /^Members/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Non-members/ })).toBeInTheDocument();
  });

  it('reads the standings from the URL as a pill, and Reset filters brings the rows back', async () => {
    renderBook(
      <>
        <MinersTab />
        <LocationProbe />
      </>,
      {},
      '/corp/moons/miners?members=0&guests=0'
    );
    expect(screen.queryByRole('table', { name: 'Miners' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove filter: In corp: None' })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    const table = await screen.findByRole('table', { name: 'Miners' });
    expect(within(table).getByText('Pilot 1')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/corp\/moons\/miners$/);
  });

  it('keeps the sort in the URL: reads ?sort= and writes a header click back', async () => {
    renderBook(
      <>
        <MinersTab />
        <LocationProbe />
      </>,
      {},
      '/corp/moons/miners?sort=miner:desc'
    );
    const table = screen.getByRole('table', { name: 'Miners' });
    expect(within(table).getByRole('columnheader', { name: /^Miner/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    );
    await userEvent.click(within(table).getByRole('button', { name: /^Credit/ }));
    const search = screen.getByTestId('location').textContent?.split('?')[1] ?? '';
    expect(new URLSearchParams(search).get('sort')).toMatch(/^credit:(asc|desc)$/);
  });

  it('sorts by Standing and Credit, and the Columns menu hides a column but never the Miner', async () => {
    renderBook(<MinersTab />);
    const table = screen.getByRole('table', { name: 'Miners' });
    expect(within(table).getByRole('button', { name: /In corp/ })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: /^Credit/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Miner' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Credit' }));
    expect(within(table).queryByRole('button', { name: /^Credit/ })).not.toBeInTheDocument();
    expect(within(table).getByText('Pilot 1')).toBeInTheDocument();
  });

  it('the row ⋮ holds Record payment, Dismiss tax and Mark not tax; the last says why it is inert', async () => {
    renderBook(<MinersTab />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pilot 1' }));
    const menu = await screen.findByRole('menu');
    for (const name of ['Show info', 'Record payment', 'Dismiss tax']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    }
    // Show info, Open in new tab (the row opens a page), then the three real actions: nothing else.
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(5);
    // No payment in this book: the item stays, inert.
    expect(within(menu).getByRole('menuitem', { name: 'Mark not tax' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(within(menu).queryByRole('menuitem', { name: 'Send reminder' })).not.toBeInTheDocument();
  });

  it("a row click opens that Miner's page instead of expanding in place", async () => {
    renderBook(
      <>
        <MinersTab />
        <LocationProbe />
      </>
    );
    await userEvent.click(screen.getByText('Pilot 1'));
    expect(screen.getByTestId('location')).toHaveTextContent('/corp/moons/miners/solo%3A1');
    expect(screen.queryByText(/Next Statement · 1/)).not.toBeInTheDocument();
  });
});

describe('MinersTab row menu dialogs', () => {
  it('Record payment and Dismiss tax open their dialogs from the ⋮', async () => {
    renderBook(<MinersTab />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pilot 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Record payment' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pilot 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Dismiss tax' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('Record payment dialog', () => {
  it('asks no reason and records with an amount alone', async () => {
    renderBook(<MinersTab />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pilot 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Record payment' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/Reason/)).not.toBeInTheDocument();
    const amount = within(dialog).getByRole('textbox', { name: 'Amount' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '1000');
    await userEvent.click(within(dialog).getByRole('button', { name: /^Record / }));
    await waitFor(() => expect(editBook).toHaveBeenCalled());
    const sent = editBook.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(sent).toMatchObject({ action: 'recordPayment', amount: 1000 });
    expect(sent).not.toHaveProperty('note');
  });
});

describe('Mark not tax dialog', () => {
  it('confirms with the optional reason empty and sends none', async () => {
    renderBook(
      <MarkNotTaxDialog
        open
        onClose={vi.fn()}
        payment={{ id: 'p1', amount: 5000, at: '2026-09-10T12:00:00Z', minerId: 'm1' }}
        fromName="Pilot 1"
      />
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Reason (optional)')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'All' }));
    await userEvent.click(within(dialog).getByRole('button', { name: /^Mark .* not tax$/ }));
    await waitFor(() => expect(editBook).toHaveBeenCalled());
    const sent = editBook.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(sent).toMatchObject({ action: 'markNotTax', paymentId: 'p1', notTaxAmount: 5000 });
    expect(sent).not.toHaveProperty('reason');
  });
});

describe('LateNoticeRun (late notices, #6294)', () => {
  /** Two Miners 60 days behind, each owing at least the default notice minimum. */
  const behind = {
    now: '2026-10-18T14:00:00Z',
    lastSyncedAt: '2026-10-18T12:00:00Z',
    entries: [entry(1, '2026-08-10', 100_000), entry(2, '2026-08-11', 200_000)],
  };

  it("on a desktop shows the chosen Miner's mail beside the step, picked by a labelled select", async () => {
    renderBook(<LateNoticeRun />, behind);
    const preview = screen.getByRole('region', { name: 'Mail preview' });
    expect(within(preview).getByText(/moon tax: late notice/)).toBeInTheDocument();
    expect(within(preview).getByRole('combobox', { name: 'Preview for' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview mail' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    expect(screen.getByRole('region', { name: 'Mail preview' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview mail' })).not.toBeInTheDocument();
  });

  it('keeps Send disabled until the corporation name resolves, then previews with it', async () => {
    stubViewport(BELOW_DESKTOP_QUERY);
    corpName.value = null;
    const first = renderBook(<LateNoticeRun />, behind);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    expect(screen.getByText('Loading corporation name…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send 2 late notices' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Preview mail' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(editBook).not.toHaveBeenCalled();
    first.unmount();

    corpName.value = 'Ore & Glory';
    renderBook(<LateNoticeRun />, behind);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    expect(screen.getByRole('button', { name: 'Send 2 late notices' })).not.toHaveAttribute(
      'aria-disabled'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Preview mail' }));
    expect(await screen.findByText(/Ore & Glory moon tax: late notice/)).toBeInTheDocument();
  });

  it('previews the mail of each Miner from the Send step, before sending', async () => {
    stubViewport(BELOW_DESKTOP_QUERY);
    renderBook(<LateNoticeRun />, behind);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview mail' }));
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next Miner' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(enqueueLateNotices).not.toHaveBeenCalled();
  });

  it('checks, then issues each notice before handing the mails to the queue', async () => {
    const { reload } = renderBook(<LateNoticeRun />, behind);
    expect(screen.getByRole('heading', { name: 'Late notices' })).toBeInTheDocument();
    expect(screen.getByText('2 to send')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    expect(screen.getByText(/about \d+ minute/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send 2 late notices' }));

    await waitFor(() => expect(enqueueLateNotices).toHaveBeenCalledTimes(1));
    const issued = editBook.mock.calls.map((c) => (c[2] as { action: string }).action);
    expect(issued).toEqual(['issueLateNotice', 'issueLateNotice']);
    const stored = editBook.mock.calls[0][2] as {
      notice: { kind: string; issuedBy: number; names: Record<string, unknown> };
    };
    expect(stored.notice.kind).toBe('late');
    expect(stored.notice.issuedBy).toBe(7);
    expect(stored.notice.names.minerName).toMatch(/^Pilot \d$/);
    expect(stored.notice.names.refineryNames).toEqual({ '1001': 'Efa - Brass Anvil' });
    const [{ notices, corporationId, senderCharacterId }] = enqueueLateNotices.mock.calls[0];
    expect(corporationId).toBe(CORP);
    expect(senderCharacterId).toBe(7);
    expect(notices.map((s: { amountDue: number }) => s.amountDue).sort()).toEqual([
      10_000_000, 20_000_000,
    ]);
    expect(await screen.findByText('1 late notice is in the send queue.')).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
  });

  it('mails and issues only the ticked Miners', async () => {
    renderBook(<LateNoticeRun />, behind);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    await userEvent.click(boxes[0]);
    expect(screen.getByText('1 to send')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send 1 late notice' }));

    await waitFor(() => expect(enqueueLateNotices).toHaveBeenCalledTimes(1));
    // A notice is rebuilt every run, so an unticked one is not issued at all.
    const issued = editBook.mock.calls.map((c) => (c[2] as { action: string }).action);
    expect(issued).toEqual(['issueLateNotice']);
    expect(enqueueLateNotices.mock.calls[0][0].notices).toHaveLength(1);
  });

  it('leaves Send off until at least one Miner is ticked', async () => {
    renderBook(<LateNoticeRun />, behind);
    for (const box of screen.getAllByRole('checkbox')) await userEvent.click(box);
    expect(screen.getByRole('button', { name: 'Continue to send' })).toBeDisabled();
  });

  it("sends the officer's edit of one Miner's mail, the other mail as standard", async () => {
    renderBook(<LateNoticeRun />, behind);
    const preview = screen.getByRole('region', { name: 'Mail preview' });
    await userEvent.click(within(preview).getByRole('button', { name: 'Edit mail' }));
    const subject = within(preview).getByRole('textbox', { name: 'Subject' });
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Your moon tax is late');
    const body = within(preview).getByRole('textbox', { name: 'Message' });
    const link = (body as HTMLTextAreaElement).value.match(/<a href="[^"]+">[^<]+<\/a>/)![0];
    await userEvent.clear(body);
    await userEvent.click(body);
    await userEvent.paste(`Please pay today. ${link}`);
    await userEvent.click(within(preview).getByRole('button', { name: 'Save mail' }));

    expect(within(preview).getByText('Edited')).toBeInTheDocument();
    expect(within(preview).getByText(/Your moon tax is late/)).toBeInTheDocument();
    expect(screen.getAllByText('Edited mail')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send 2 late notices' }));
    await waitFor(() => expect(enqueueLateNotices).toHaveBeenCalledTimes(1));
    const { notices } = enqueueLateNotices.mock.calls[0][0] as {
      notices: { edited?: { subject: string; body: string } }[];
    };
    const edited = notices.filter((n) => n.edited);
    expect(edited).toHaveLength(1);
    expect(edited[0].edited).toEqual({
      subject: 'Your moon tax is late',
      body: `Please pay today. ${link}`,
    });
    expect(link).toContain(`${window.location.origin}/corp-tax-book/verify/…`);
  });

  it('edits the mail in the Preview mail dialog below desktop, and sends it', async () => {
    stubViewport(BELOW_DESKTOP_QUERY);
    renderBook(<LateNoticeRun />, behind);
    await userEvent.click(screen.getByRole('button', { name: 'Preview mail' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit mail' }));
    const subject = within(dialog).getByRole('textbox', { name: 'Subject' });
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Late tax');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save mail' }));
    expect(within(dialog).getByText('Edited')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(screen.getByText('Edited mail')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send 2 late notices' }));
    await waitFor(() => expect(enqueueLateNotices).toHaveBeenCalledTimes(1));
    const { notices } = enqueueLateNotices.mock.calls[0][0] as {
      notices: { edited?: { subject: string } }[];
    };
    expect(notices.map((n) => n.edited?.subject).filter(Boolean)).toEqual(['Late tax']);
  });

  it('keeps the standard mail on Cancel, and goes back to it on Use the standard mail', async () => {
    renderBook(<LateNoticeRun />, behind);
    const preview = screen.getByRole('region', { name: 'Mail preview' });
    await userEvent.click(within(preview).getByRole('button', { name: 'Edit mail' }));
    await userEvent.type(within(preview).getByRole('textbox', { name: 'Subject' }), ' now');
    await userEvent.click(within(preview).getByRole('button', { name: 'Cancel' }));
    expect(within(preview).queryByText('Edited')).not.toBeInTheDocument();

    await userEvent.click(within(preview).getByRole('button', { name: 'Edit mail' }));
    const body = within(preview).getByRole('textbox', { name: 'Message' });
    await userEvent.clear(body);
    expect(within(preview).getByRole('button', { name: 'Save mail' })).toBeDisabled();
    await userEvent.type(body, 'Pay up.');
    expect(within(preview).getByText(/no longer has the verify link/)).toBeInTheDocument();
    await userEvent.click(within(preview).getByRole('button', { name: 'Save mail' }));
    expect(within(preview).getByText('Edited')).toBeInTheDocument();

    await userEvent.click(within(preview).getByRole('button', { name: 'Use the standard mail' }));
    expect(within(preview).queryByText('Edited')).not.toBeInTheDocument();
    expect(within(preview).getByText(/moon tax: late notice/)).toBeInTheDocument();
  });

  it('shows a refused issue instead of queueing mail', async () => {
    editBook.mockRejectedValueOnce(new Error('An issued Statement never changes'));
    renderBook(<LateNoticeRun />, behind);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send 2 late notices' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An issued Statement never changes');
    expect(enqueueLateNotices).not.toHaveBeenCalled();
  });
});

describe('Totals links and Overdue by age', () => {
  /**
   * Pilot 1 (100,000 owed) issued 2026-09-02: 2 days overdue on 2026-09-18. Pilot 2 (200,000)
   * issued 2026-07-20: 46 days overdue.
   */
  function overdueBook() {
    const first = buildBookView(input({ now: '2026-09-02T12:00:00Z' }));
    const notices = first.miners.map((m) => {
      const n = draftNotice(first, m.id)!.notice;
      return m.mainCharacterId === 2 ? { ...n, issuedAt: '2026-07-20T00:00:00Z' } : n;
    });
    return { notices };
  }

  it('links Owed and Overdue to the Miners narrowed to them; an empty Credit stays a readout', () => {
    renderBook(<BookTotals />, overdueBook(), '/corp/moons/overview');
    expect(screen.getByRole('link', { name: 'Owed 300,000' })).toHaveAttribute(
      'href',
      '/corp/moons/miners?balance=owing'
    );
    expect(screen.getByRole('link', { name: /^Overdue 300,000 · 2 Miners$/ })).toHaveAttribute(
      'href',
      '/corp/moons/miners?balance=overdue'
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('breaks overdue debt into age buckets, each linking to its Miners', () => {
    renderBook(<OverdueAging />, overdueBook(), '/corp/moons/overview');
    const aging = screen.getByRole('region', { name: 'Overdue by age' });
    expect(
      within(aging).getByRole('link', { name: '0–30 days 100,000 · 1 Miner' })
    ).toHaveAttribute('href', '/corp/moons/miners?balance=overdue-0-30');
    expect(
      within(aging).getByRole('link', { name: '31–60 days 200,000 · 1 Miner' })
    ).toHaveAttribute('href', '/corp/moons/miners?balance=overdue-31-60');
    expect(within(aging).getAllByRole('link')).toHaveLength(2);
  });

  it('is gone while nothing is overdue', () => {
    renderBook(<OverdueAging />, {}, '/corp/moons/overview');
    expect(screen.queryByRole('region', { name: 'Overdue by age' })).not.toBeInTheDocument();
  });

  it('reads ?balance= into a Balance pill and lists only the Miners in that bucket', async () => {
    renderBook(<MinersTab />, overdueBook(), '/corp/moons/miners?balance=overdue-31-60');
    const table = screen.getByRole('table', { name: 'Miners' });
    expect(within(table).getByText('Pilot 2')).toBeInTheDocument();
    expect(within(table).queryByText('Pilot 1')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove filter: Balance: Overdue 31–60 days' })
    );
    expect(await within(table).findByText('Pilot 1')).toBeInTheDocument();
  });
});
