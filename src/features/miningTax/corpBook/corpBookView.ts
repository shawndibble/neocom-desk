/**
 * The member's whole Corp Tax Book picture for the Tax tab (#4065), built from
 * what was loaded: the books' own lines, the prices at each book's hub, and the
 * member's ledger and wallet. Pure; `useCorpBookView` does the loading.
 */
import {
  inFlightDonations,
  overlayCorpBooks,
  type BookSummary,
  type MadeDonation,
  type PersonalBook,
  type PersonalOverlay,
} from '@/engine/corpTaxBook/personal';
import type { PayeeRecord } from '@/db';
import {
  pricesAtHubOnDate,
  sourcesAtHubOnDate,
  type DatedUnitPrices,
} from '@/features/miningTax/pricing';
import type { MadePayment } from '../paymentLinks';
import type { MoonMiningTaxRow } from '../snapshot';
import type { ClaimablePayment, LoadedCorpBook } from './corpBookStore';
import { payeesOfBookCorporation } from '@/engine/miningTax/payeeCorporation';
import { corpPayee, personalEntriesOf } from './corpRows';

/** A payment the member made, as the book's overlay reads it; only a journal entry carries a `refId`. */
export function madeDonationOf(m: MadePayment): MadeDonation {
  return {
    characterId: m.characterId,
    ...(m.counterpartyId !== undefined ? { counterpartyId: m.counterpartyId } : {}),
    amount: m.amount,
    date: m.date,
    method: m.method,
    ...(m.kind === 'journal' ? { refId: m.refId } : {}),
  };
}

export interface CorpBookViewBook {
  loaded: LoadedCorpBook;
  corpName: string;
  /** None of the tracked Characters is in the corporation any more (Leavers keep read access). */
  left: boolean;
  summary: BookSummary;
  payee: PayeeRecord;
  /** The earliest day whose corp record is still pending, when any is. */
  pendingFrom?: string;
}

export interface CorpClaim {
  corporationId: number;
  corpName: string;
  characterName: string;
  payment: ClaimablePayment;
}

export interface CorpBookView {
  overlay: PersonalOverlay;
  books: CorpBookViewBook[];
  /** The virtual Payees, named for the corporation, for balances and the Payee filter only. */
  payees: PayeeRecord[];
  claims: CorpClaim[];
}

export interface CorpBookViewInput {
  rows: readonly MoonMiningTaxRow[];
  loaded: readonly LoadedCorpBook[];
  /** Prices at each book's hub and Ore Form, per corporation. */
  pricesByCorp: ReadonlyMap<number, DatedUnitPrices>;
  corpNames: ReadonlyMap<number, string>;
  /** The member's stored Payees: one verified as a book's corporation is that book's own Payee. */
  payees: readonly PayeeRecord[];
  made: readonly MadePayment[];
  /**
   * The Made Payments links hold (`heldPaymentKeys`): each pays the personal Payee it is linked
   * to, so none counts as a donation in flight to a book as well.
   */
  linked?: ReadonlySet<string>;
  characterNames: ReadonlyMap<number, string>;
  now: string;
}

export function buildCorpBookView(
  input: CorpBookViewInput,
  payeeName: (corpName: string) => string
): CorpBookView | null {
  const { loaded, pricesByCorp } = input;
  const ready = loaded.filter((book) => pricesByCorp.has(book.corporationId));
  if (ready.length === 0) return null;
  const nameOf = (corporationId: number) =>
    input.corpNames.get(corporationId) ?? `#${corporationId}`;

  // Payees verified as a corporation: a moon owner's among them names a Collector's conflict.
  const payeeCorporations = Object.fromEntries(
    input.payees.flatMap((p) =>
      p.entityKind === 'corporation' && p.entityId !== undefined ? [[p.id, p.entityId]] : []
    )
  );
  const books: PersonalBook[] = ready.map((book) => {
    const dated = pricesByCorp.get(book.corporationId)!;
    return {
      corporationId: book.corporationId,
      corpName: nameOf(book.corporationId),
      characterIds: book.characterIds,
      startDate: book.startDate,
      graceHours: book.graceHours,
      ...(book.lastSyncedAt !== undefined ? { lastSyncedAt: book.lastSyncedAt } : {}),
      ...(book.donationsCheckedAt !== undefined
        ? { donationsCheckedAt: book.donationsCheckedAt }
        : {}),
      rates: book.rates,
      miners: book.miners,
      observed: book.observed,
      dismissals: book.dismissals,
      notices: book.notices,
      ...(book.checkpoints ? { checkpoints: book.checkpoints } : {}),
      payments: book.payments,
      ...(book.feeders ? { feeders: book.feeders } : {}),
      ...(book.adjustments ? { adjustments: book.adjustments } : {}),
      ...(book.toleranceExemptions ? { toleranceExemptions: book.toleranceExemptions } : {}),
      ...(book.minerPaidThrough ? { minerPaidThrough: book.minerPaidThrough } : {}),
      ...(book.writeOffs ? { writeOffs: book.writeOffs } : {}),
      ...(book.declarations ? { declarations: book.declarations } : {}),
      ...(book.disputes ? { disputes: book.disputes } : {}),
      ...(book.structureNames ? { structureNames: book.structureNames } : {}),
      hubId: book.hubId,
      oreForm: book.oreForm,
      // Linked, or named exactly as the corporation (`payeesOfBookCorporation`): a Payee missing
      // its link on this device is still the corporation's own, never a second Payee.
      ownPayeeIds: payeesOfBookCorporation(input.payees, {
        corporationId: book.corporationId,
        name: nameOf(book.corporationId),
      }).map((p) => p.id),
      payeeCorporations,
      pricesOn: (date) => ({
        prices: new Map(pricesAtHubOnDate(dated, book.hubId, date)),
        sources: new Map(sourcesAtHubOnDate(dated, book.hubId, date)),
      }),
      inReviewRefs: (book.inReview ?? []).flatMap((d) => (d.refId === undefined ? [] : [d.refId])),
      inFlight: inFlightDonations(
        input.made.filter((p) => !input.linked?.has(p.key)).map(madeDonationOf),
        book.held,
        book.corporationId,
        book.startDate
      ),
    };
  });

  const overlay = overlayCorpBooks({
    entries: personalEntriesOf(input.rows),
    books,
    now: input.now,
  });
  const viewBooks: CorpBookViewBook[] = ready.map((loadedBook) => {
    const summary = overlay.books.find((b) => b.corporationId === loadedBook.corporationId)!;
    const corpName = nameOf(loadedBook.corporationId);
    const pendingDates = [...overlay.labels]
      .filter(
        ([, label]) => label.state === 'pending' && label.corporationId === loadedBook.corporationId
      )
      .map(([key]) => key.split(':')[1])
      .sort();
    const ownRate = overlay.rows.find((r) => r.corporationId === loadedBook.corporationId)?.taxPct;
    const firstChar = loadedBook.characterIds[0];
    return {
      loaded: loadedBook,
      corpName,
      left: loadedBook.memberCharacterIds.length === 0,
      summary,
      payee: corpPayee(
        loadedBook.corporationId,
        firstChar,
        payeeName(corpName),
        ownRate ?? loadedBook.rates.find((r) => r.scope === 'corp')?.pct ?? 0,
        loadedBook.hubId
      ),
      ...(pendingDates[0] !== undefined ? { pendingFrom: pendingDates[0] } : {}),
    };
  });
  const claims: CorpClaim[] = ready.flatMap((book) =>
    book.claimable.map((payment) => ({
      corporationId: book.corporationId,
      corpName: nameOf(book.corporationId),
      characterName: input.characterNames.get(payment.characterId) ?? `#${payment.characterId}`,
      payment,
    }))
  );
  return {
    overlay,
    books: viewBooks,
    payees: viewBooks.map((b) => b.payee),
    claims,
  };
}
