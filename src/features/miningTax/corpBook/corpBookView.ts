import {
  inFlightDonations,
  overlayCorpBooks,
  type BookSummary,
  type MadeDonation,
  type PersonalBook,
  type PersonalOverlay,
} from '@/engine/corpTaxBook/personal';
import type { PayeeRecord } from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import {
  pricesAtHubOnDate,
  sourcesAtHubOnDate,
  type DatedUnitPrices,
} from '@/features/miningTax/pricing';
import type { MadePayment } from '../paymentLinks';
import type { MoonMiningTaxRow } from '../snapshot';
import type { ClaimablePayment, LoadedCorpBook } from './corpBookStore';
import { payeesOfBookCorporation } from '@/engine/miningTax/payeeCorporation';
import { corpPayee, corpPayeeId, personalEntriesOf } from './corpRows';

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
  left: boolean;
  summary: BookSummary;
  payee: PayeeRecord;
  pendingFrom?: string;
  settlingFrom?: string;
  estimateFrom?: string;
  finalThrough?: string;
}

export interface CorpClaim {
  corporationId: number;
  corpName: string;
  characterName: string;
  payment: ClaimablePayment;
}

export function statedDonationsOf(
  links: readonly PayeePaymentLink[],
  corporationId: number
): MadeDonation[] {
  return links.flatMap((l) =>
    l.kind === 'recorded' && l.payeeId === corpPayeeId(corporationId) && l.characterId !== undefined
      ? [
          {
            characterId: l.characterId,
            counterpartyId: corporationId,
            amount: l.amount,
            date: `${l.paidOn}T23:59:59.000Z`,
            method: 'donation',
            stated: true as const,
          },
        ]
      : []
  );
}

export interface CorpBookView {
  overlay: PersonalOverlay;
  books: CorpBookViewBook[];
  payees: PayeeRecord[];
  claims: CorpClaim[];
}

export interface CorpBookViewInput {
  rows: readonly MoonMiningTaxRow[];
  loaded: readonly LoadedCorpBook[];
  pricesByCorp: ReadonlyMap<number, DatedUnitPrices>;
  corpNames: ReadonlyMap<number, string>;
  payees: readonly PayeeRecord[];
  made: readonly MadePayment[];
  linked?: ReadonlySet<string>;
  recorded?: readonly PayeePaymentLink[];
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
        [
          ...input.made.filter((p) => !input.linked?.has(p.key)).map(madeDonationOf),
          ...statedDonationsOf(input.recorded ?? [], book.corporationId),
        ],
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
    const settlingFrom = overlay.rows
      .filter((r) => r.state === 'settling' && r.corporationId === loadedBook.corporationId)
      .map((r) => r.date)
      .sort()[0];
    const estimates = overlay.rows.filter(
      (r) => r.state === 'estimate' && r.corporationId === loadedBook.corporationId
    );
    const estimateFrom = estimates
      .filter((r) => !r.final)
      .map((r) => r.date)
      .sort()[0];
    const finalThrough = estimates
      .filter((r) => r.final)
      .map((r) => r.date)
      .sort()
      .at(-1);
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
      ...(settlingFrom !== undefined ? { settlingFrom } : {}),
      ...(estimateFrom !== undefined ? { estimateFrom } : {}),
      ...(finalThrough !== undefined ? { finalThrough } : {}),
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
