import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { DatedUnitPrices } from '@/features/miningTax/pricing';
import { buildCorpBookView, type CorpBookView } from './corpBook/corpBookView';
import type { LoadedCorpBook } from './corpBook/corpBookStore';
import type { MoonMiningTaxRow } from './snapshot';
import type { PayeeRecord } from '@/db';

const ME = 90000001;
const ZEO = 45490;
const CORP = 98000001;
const SYSTEM = 30003838;

const mined = (date: string, quantity: number): MoonMiningTaxRow => ({
  characterId: ME,
  characterName: 'Kestrel Vane',
  entry: {
    characterId: ME,
    date,
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ZEO, quantity }],
  },
  assignments: [],
  unassignedOreLines: [{ typeId: ZEO, quantity }],
});

const personalPayee = {
  id: 'p1',
  characterId: ME,
  name: 'Ashfall Prospecting',
  defaultTaxPct: 10,
  updatedAt: 1,
};

const snapshot = {
  entries: [mined('2026-10-17', 41_200), mined('2026-10-13', 5000)],
  characters: [{ characterId: ME, characterName: 'Kestrel Vane' }],
  payeesByCharacter: new Map([[ME, [personalPayee]]]),
  paymentLinks: [],
  billedElsewhere: new Map(),
  unclassified: [],
  reauthCharacters: [],
  fetchedAt: new Date(),
  fromCache: false,
  systemNames: new Map([[SYSTEM, 'Efa']]),
  systemSecurity: new Map([[SYSTEM, -0.1]]),
  typeNames: new Map([[ZEO, 'Zeolites']]),
  datedPrices: {
    byHubAndDate: new Map(),
    unpricedByHub: new Map(),
    sellFallbackByHubAndDate: new Map(),
    unpriced: new Set<number>(),
  } satisfies DatedUnitPrices,
  unpricedByHub: new Map(),
  unpricedTypeIds: new Set<number>(),
};

const hoisted = vi.hoisted(() => ({ view: null as CorpBookView | null, booksKnown: true }));

vi.mock('@/lib/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({
    data: snapshot,
    error: null,
    loading: false,
    activeCharacterId: 90000001,
    refresh: vi.fn(),
  }),
}));
vi.mock('./corpBook/useCorpBookView', () => ({
  useCorpBookView: () => ({
    booksRead: true,
    booksKnown: hoisted.booksKnown,
    view: hoisted.view,
    reload: vi.fn(),
    // No book the member has left: the left-the-corp notice has nothing to say here.
    shownBooks: [],
    corpNameOf: (id: number) => `Corp ${id}`,
    hiddenLeft: [],
  }),
}));
vi.mock('@/features/miningTax/madePayments', () => ({
  loadMadePaymentsWithStatus: async () => ({ payments: [], sources: [] }),
}));

const { TaxTab } = await import('./TaxTab');
const { keptDayKey, useNotPayingSetting } = await import('./corpBook/resolve/notPaying');

const prices: DatedUnitPrices = {
  byHubAndDate: new Map([['jita', new Map([['2026-10-17', new Map([[ZEO, 148]])]])]]),
  unpricedByHub: new Map(),
  sellFallbackByHubAndDate: new Map(),
  unpriced: new Set(),
  sourcesByHubAndDate: new Map([
    ['jita', new Map([['2026-10-17', new Map([[ZEO, 'saved' as const]])]])],
  ]),
};

const book: LoadedCorpBook = {
  corporationId: CORP,
  startDate: '2026-10-01',
  graceHours: 6,
  hubId: 'jita',
  oreForm: 'compressed',
  divisions: [1],
  rates: [{ scope: 'corp', pct: 15, effectiveFrom: '2026-10-01' }],
  lastSyncedAt: '2026-10-18T12:00:00.000Z',
  observed: [
    {
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date: '2026-10-17',
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ZEO, quantity: 43_050 }],
    },
  ],
  payments: [],
  held: [],
  claimable: [],
  dismissals: [],
  notices: [],
  miners: [],
  characterIds: [ME],
  memberCharacterIds: [ME],
};

function renderTab() {
  render(
    <MemoryRouter>
      <TaxTab tabBar={null} tabsId="t" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-18T14:00:00Z'));
  hoisted.view = null;
  hoisted.booksKnown = true;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TaxTab with a Corp Tax Book', () => {
  it('is the personal tab, unchanged, with no book (D24)', () => {
    renderTab();
    expect(screen.queryByText(/Corp Tax Book/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
  });

  it('shows no Payee card until the books are known, so a card is never replaced by its book', () => {
    hoisted.booksKnown = false;
    renderTab();
    expect(screen.queryByRole('region', { name: /You owe|No moon mining tax/ })).toBeNull();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows the corp Payee balance, a Billed row and the Safe to pay note', async () => {
    hoisted.view = buildCorpBookView(
      {
        rows: snapshot.entries,
        loaded: [book],
        pricesByCorp: new Map([[CORP, prices]]),
        corpNames: new Map([[CORP, 'Brass Meridian Logistics']]),
        payees: [],
        made: [],
        characterNames: new Map([[ME, 'Kestrel Vane']]),
        now: '2026-10-18T14:00:00Z',
      },
      (corp) => `${corp}`
    );
    const user = userEvent.setup();
    renderTab();
    expect(screen.getAllByText('Brass Meridian Logistics').length).toBeGreaterThan(0);
    expect(screen.getByText('Billed')).toBeInTheDocument();
    // The 13 Oct ore is free and no book observed it at all: still the member's to assign (D12).
    expect(screen.queryByText('Unattributed')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
    expect(screen.getByText(/Safe to pay — 17 Oct is closed/)).toBeInTheDocument();
    // The corp's balance has Settle up but no "Link payment": the book credits donations itself.
    expect(screen.queryByRole('button', { name: /link payment/i })).not.toBeInTheDocument();

    // The pill is a tooltip control; the row opens from its date cell.
    await user.click(screen.getAllByText('2026-10-17')[0]);
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByText(/Disputed/)).toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
  });
});

/** A book that reads every wallet division, so an uncredited donation can only mean a late sync. */
const everyDivisionBook: LoadedCorpBook = { ...book, divisions: [1, 2, 3, 4, 5, 6, 7] };

const donation = (refId: number, date: string, amount: number) => ({
  key: `journal:${refId}`,
  kind: 'journal' as const,
  refId,
  characterId: ME,
  date,
  amount,
  method: 'donation' as const,
  counterpartyId: CORP,
  label: 'Player Donation',
});

/** A day the member allocated at one rate, so `disputeOf` has a rate of theirs to compare. */
const assigned = (quantity: number, payeeId: string, taxPct: number): MoonMiningTaxRow => ({
  characterId: ME,
  characterName: 'Kestrel Vane',
  entry: {
    characterId: ME,
    date: '2026-10-17',
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ZEO, quantity }],
  },
  assignments: [
    {
      id: 'a-17',
      characterId: ME,
      date: '2026-10-17',
      solarSystemId: SYSTEM,
      payeeId,
      oreLines: [{ typeId: ZEO, quantity }],
      taxPct,
      estimatedValue: quantity * 148,
      taxOwed: quantity * 148 * (taxPct / 100),
      status: 'outstanding',
      updatedAt: 1,
    },
  ],
  unassignedOreLines: [],
});

/** The corporation as one of the member's own Payees, so its ore is not "another Payee's". */
const corpPayee: PayeeRecord = {
  id: 'corp1',
  characterId: ME,
  name: 'Brass Meridian Logistics',
  defaultTaxPct: 10,
  updatedAt: 1,
  entityKind: 'corporation',
  entityId: CORP,
};

function viewWith(
  loaded: LoadedCorpBook,
  made: ReturnType<typeof donation>[] = [],
  over: { rows?: MoonMiningTaxRow[]; payees?: PayeeRecord[] } = {}
) {
  return buildCorpBookView(
    {
      rows: over.rows ?? snapshot.entries,
      loaded: [loaded],
      pricesByCorp: new Map([[CORP, prices]]),
      corpNames: new Map([[CORP, 'Brass Meridian Logistics']]),
      payees: over.payees ?? [],
      made,
      characterNames: new Map([[ME, 'Kestrel Vane']]),
      now: '2026-10-18T14:00:00Z',
    },
    (corp) => `${corp}`
  );
}

describe('uncredited donations in the attention strip', () => {
  it('gives one book one item, however many of its donations are uncredited', async () => {
    hoisted.view = viewWith(everyDivisionBook, [
      // Both are older than UNCREDITED_AFTER_DAYS before the book's last sync (18 Oct 12:00).
      donation(1, '2026-10-11T22:38:00.000Z', 26_952_549),
      donation(2, '2026-10-13T01:21:00.000Z', 1_824_664),
    ]);
    const user = userEvent.setup();
    renderTab();

    // Two donations, one corporation, one row in the strip — not the same advisory twice. (The
    // strip may also list the day's own figure dispute; that is another problem.)
    await user.click(screen.getByText('Show'));
    expect(screen.getAllByText(/hasn't credited/)).toHaveLength(1);
    expect(
      screen.getByText(/Brass Meridian Logistics hasn't credited 2 of your donations/)
    ).toBeInTheDocument();
    // And it has a way out, not advice: one Resolve.
    expect(screen.getAllByRole('button', { name: 'Resolve' }).length).toBeGreaterThan(0);

    // Each donation still names itself, so the member can give an officer the exact transfers.
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent).join(' | ')).toMatch(/26,952,549 ISK, sent/);
    expect(items.map((li) => li.textContent).join(' | ')).toMatch(/1,824,664 ISK, sent/);

    // The app matched the donation to the corp from the member's own journal (inFlightDonations):
    // it must not send them off to re-check what it already knows.
    expect(screen.queryByText(/check in your wallet journal/i)).not.toBeInTheDocument();
  });

  it('keeps the single-donation wording when only one is uncredited', async () => {
    hoisted.view = viewWith(everyDivisionBook, [
      donation(1, '2026-10-11T22:38:00.000Z', 26_952_549),
    ]);
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByText('Show'));
    expect(
      screen.getByText(/hasn't credited your 26,952,549 ISK donation of 2026-10-11/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

describe('donations the book holds for review without counting them (#6207)', () => {
  const held = (refId: number, at: string, amount: number, reason?: string) => ({
    id: `j5_${refId}`,
    characterId: ME,
    amount,
    at,
    refId,
    ...(reason ? { reason } : {}),
  });

  // Neither in flight (the book has them) nor credited: nothing else on the tab says where the
  // ISK went, so the member sees them, with every one listed and a Resolve.
  it('names them once per book, each with its amount and what the member wrote', async () => {
    hoisted.view = viewWith({
      ...book,
      inReview: [
        held(26226487580, '2026-10-02T22:38:44.000Z', 26_952_549, 'Moon tax 10-01/10-02'),
        held(26271892482, '2026-10-14T18:28:44.000Z', 10_976_509),
        // Paid before the book bills from: it paid no mining the book bills.
        held(26177051185, '2026-09-21T17:38:23.000Z', 11_340_032),
      ],
    });
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByText('Show'));
    expect(
      screen.getByText(
        /Brass Meridian Logistics holds 2 of your donations without counting them \(37,929,058 ISK\)/
      )
    ).toBeInTheDocument();
    const items = screen
      .getAllByRole('listitem')
      .map((li) => li.textContent)
      .join(' | ');
    expect(items).toMatch(/26,952,549 ISK, sent .*Moon tax 10-01\/10-02/);
    expect(items).toMatch(/10,976,509 ISK, sent/);
    expect(items).not.toMatch(/11,340,032/);
    expect(screen.getAllByRole('button', { name: 'Resolve' }).length).toBeGreaterThan(0);
  });
});

describe('a bill an officer kept', () => {
  const rejected = {
    id: `solo_${ME}_2026-10-17`,
    minerId: `solo:${ME}`,
    date: '2026-10-17',
    kind: 'quantity' as const,
    reason: 'My ledger says 41,200',
    lines: [{ recordKey: `${ME}:1000:2026-10-17`, typeId: ZEO, quantity: 1850, payeeName: '' }],
    by: ME,
    at: '2026-10-17T13:00:00.000Z',
    resolution: {
      kind: 'rejected' as const,
      at: '2026-10-18T09:00:00.000Z',
      by: 1,
      reason: 'The book is right',
      nextStep: 'Pay it, or re-mine the shortfall',
    },
  };

  // The officer's next step, word for word, with Resolve again and a one-click Not paying.
  it('reads the next step on the attention strip with Resolve and Not paying', async () => {
    hoisted.view = viewWith({ ...book, disputes: [rejected] });
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByText('Show'));
    expect(
      screen.getByText(/Brass Meridian Logistics kept the bill on 2026-10-17/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('What to do next: Pay it, or re-mine the shortfall')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Resolve' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Not paying' }).length).toBeGreaterThan(0);
  });

  // "If they say f-it the tool shouldn't annoy them" - but a later answer is a new problem.
  it('hides the answer the member said no to, and shows a later one again', async () => {
    const day = '2026-10-17';
    const answered = (at: string) => ({
      ...book,
      disputes: [{ ...rejected, resolution: { ...rejected.resolution, at } }],
    });
    const hide = (at: string) =>
      useNotPayingSetting.setState({
        value: [keptDayKey(CORP, ME, day, at)],
        hydrated: true,
      });
    hide('2026-10-18T09:00:00.000Z');
    hoisted.view = viewWith(answered('2026-10-18T09:00:00.000Z'));
    const { unmount } = render(
      <MemoryRouter>
        <TaxTab tabBar={null} tabsId="t" />
      </MemoryRouter>
    );
    // Whatever else is on the strip, the answer the member said no to is not.
    const show = screen.queryByText('Show');
    if (show) await userEvent.setup().click(show);
    expect(screen.queryByText(/kept the bill on 2026-10-17/)).toBeNull();
    unmount();
    hoisted.view = viewWith(answered('2026-10-18T12:00:00.000Z'));
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByText('Show'));
    expect(screen.getByText(/kept the bill on 2026-10-17/)).toBeInTheDocument();
  });
});

/**
 * Open a 17 Oct row's detail and then Compare with the book. One day can carry several rows —
 * the member's surplus keeps a personal row where the book observed less, and a contested day
 * splits into a billed row and a conflict row — so the caller says which one to open.
 */
const openCompare = async (inRow = 'Brass Meridian Logistics') => {
  const user = userEvent.setup();
  renderTab();
  const date = screen
    .getAllByText('2026-10-17')
    .find((el) => el.closest('tr')?.textContent?.includes(inRow));
  await user.click(date ?? screen.getAllByText('2026-10-17')[0]);
  await screen.findByRole('dialog');
  await user.click(screen.getByRole('button', { name: /compare with the book/i }));
  const dialogs = await screen.findAllByRole('dialog');
  return within(dialogs[dialogs.length - 1]);
};

describe('Compare with the book: which way the difference runs', () => {
  it('gives the member both ways out when the book bills more than their record', async () => {
    // The book observed 43,050; the member recorded 41,200.
    hoisted.view = viewWith(book);
    const compare = await openCompare();
    expect(compare.getByText(/The book recorded more ore than you did/)).toBeInTheDocument();
    // No dead end: the two ways out are right beside the sentence.
    expect(compare.getByText(/If the book is right, fix your records/)).toBeInTheDocument();
    expect(compare.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
  });

  it('says there is nothing to raise when the book bills less', async () => {
    hoisted.view = viewWith({
      ...book,
      observed: [{ ...book.observed[0], oreLines: [{ typeId: ZEO, quantity: 39_000 }] }],
    });
    const compare = await openCompare();
    expect(compare.getByText(/The book recorded less ore than you did/)).toBeInTheDocument();
    expect(compare.getByText(/there is nothing to raise/)).toBeInTheDocument();
    expect(compare.queryByText(/Ask a .* officer to correct the book/)).not.toBeInTheDocument();
  });

  // The member allocated the day at one rate, so `disputeOf` sets `personalPct` and the
  // quantities agree: the rate is the whole of the difference.
  it('reads the rate when that is what differs, not the ore', async () => {
    hoisted.view = viewWith({ ...book }, [], {
      rows: [assigned(43_050, corpPayee.id, 10)],
      payees: [corpPayee],
    });
    const compare = await openCompare();
    expect(
      compare.getByText(/The book's rate is higher than the one you recorded/)
    ).toBeInTheDocument();
    // No dead end: the two ways out are right beside the sentence.
    expect(compare.getByText(/If the book is right, fix your records/)).toBeInTheDocument();
    expect(compare.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
  });

  it('says there is nothing to raise when the book’s rate is the lower one', async () => {
    hoisted.view = viewWith(
      { ...book, rates: [{ scope: 'corp', pct: 5, effectiveFrom: '2026-10-01' }] },
      [],
      { rows: [assigned(43_050, corpPayee.id, 10)], payees: [corpPayee] }
    );
    const compare = await openCompare();
    expect(
      compare.getByText(/The book's rate is lower than the one you recorded/)
    ).toBeInTheDocument();
    expect(compare.getByText(/there is nothing to raise/)).toBeInTheDocument();
  });

  // A conflict row is "Not owed yet" (`taxOwed` is null) and an officer decides it, so none of
  // these sentences may tell the member what they owe or that there is nothing to raise.
  it('claims nothing about what is owed on a row that is not owed yet', async () => {
    hoisted.view = viewWith({ ...book }, [], {
      rows: [assigned(41_200, personalPayee.id, 10)],
      payees: [personalPayee as PayeeRecord],
    });
    const compare = await openCompare('Conflict');
    expect(compare.getByText(/Disputed/)).toBeInTheDocument();
    expect(compare.queryByText(/there is nothing to raise/)).not.toBeInTheDocument();
    expect(compare.queryByText(/you owe the book's figure/i)).not.toBeInTheDocument();
    expect(compare.queryByText(/officer to correct the book/)).not.toBeInTheDocument();
  });
});
