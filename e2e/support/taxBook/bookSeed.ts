/**
 * A Corp Tax Book as the server stores it, built for one test: the settings doc, Observed Mining
 * Entries, Tax Payments, Late notices (current and legacy), groupings, disputes, declarations,
 * checkpoints. Layout: `functions/src/corpTaxBookStore.ts`, as `scripts/dev/seed-corp-tax-book.mjs`
 * writes it for the manual sandbox.
 *
 * The figures are chosen to be read off the screen. Prices are flat (`prices.ts`), the rate is
 * `RATE_PCT`, and a mined day is one ore row of `DAY_QTY` units at one refinery unless a test
 * says otherwise, so every such day owes exactly `DAY_TAX` ISK.
 *
 * Dates are UTC days counted back from today (`day(n)`): a test reads "the day 5 days ago",
 * never a calendar date, so it reads the same whenever it runs.
 */
import type { SeedDoc } from './emulator';
import { CORP, OFFICER, nameOf, recordedCorpOf, solo } from './identities';
import { UNIT_PRICE } from './prices';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const RATE_PCT = 10;
export const DAY_QTY = 10_000;
/** What one ordinary mined day owes: 10,000 units x 1,000 ISK x 10%. */
export const DAY_TAX = (DAY_QTY * UNIT_PRICE * RATE_PCT) / 100;
/** The Late notice payment code of the book's notices (`paymentCode`, corpTaxBookLateNotice.ts). */
export const ORE_TYPE = 45490; // Zeolites (R4)

export const REFINERY = {
  alpha: { id: 1_040_000_000_001, name: 'E2E Athanor Alpha', systemId: 30002187, moonId: 40139001 },
  beta: { id: 1_040_000_000_002, name: 'E2E Tatara Beta', systemId: 30002053, moonId: 40139002 },
} as const;
export type RefineryKey = keyof typeof REFINERY;

/** The UTC day `back` days before today, as the book keys it. */
export const day = (back: number, now = Date.now()): string =>
  new Date(now - back * DAY_MS).toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** That day as the book's tables print it ("13 Nov", `shortDate` in moonsFormat.ts). */
export const shortDay = (back: number, now = Date.now()): string => {
  const [, m, d] = day(back, now).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
/** ISK as the book prints it: whole, grouped ("1,000,000"). */
export const isk = (amount: number): string => Math.round(amount).toLocaleString('en-US');
/**
 * A verify token for a seeded notice: the server takes only 43 base64url characters
 * (`parseToken`, functions/src/corpTaxBook.ts), as `randomBytes(32)` makes them.
 */
export const verifyToken = (label: string): string =>
  `e2e-${label}`
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .padEnd(43, 'x')
    .slice(0, 43);

/** Noon UTC of that day, for a payment or a note made on it. */
export const noonOf = (back: number, now = Date.now()): string => `${day(back, now)}T12:00:00.000Z`;

/** `paymentCode` (functions/src/corpTaxBookLateNotice.ts), as the seed script restates it. */
export function paymentCode(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `MT${h.toString(36).toUpperCase().padStart(7, '0').slice(-6)}`;
}
/** The one code a Miner puts on a donation (`minerPaymentCode`). */
export const minerPaymentCode = (minerId: string): string => paymentCode(`miner:${minerId}`);

export interface MinedDay {
  back: number;
  refinery?: RefineryKey;
  /** Units of `ORE_TYPE`; `DAY_QTY` by default. */
  qty?: number;
}

export interface Donation {
  id: string;
  characterId: number;
  amount: number;
  back: number;
  /** The Miner the server already placed it on; omitted, it waits Unmatched. */
  minerId?: string;
  reason?: string;
  reviewReason?: 'ambiguous';
  ambiguousMinerIds?: string[];
  /** A wallet journal ref id, for a donation the journal also holds (`j1_<ref>`). */
  refId?: number;
}

interface NoticeInput {
  id: string;
  characterId: number;
  minerId?: string;
  /** The days it listed (days back), each one an ordinary mined day of `refinery`. */
  days: readonly number[];
  issuedBack: number;
  refinery?: RefineryKey;
  final?: boolean;
  remindersStopped?: boolean;
  /** The verify token its link carries. */
  token: string;
}

/**
 * The builder. Each method adds docs; `docs()` returns them for `book.seed`. One instance per
 * test, made from the scenario functions in `bookScenarios.ts`.
 */
export class BookSeed {
  readonly now = Date.now();
  private readonly out = new Map<string, Record<string, unknown>>();
  private readonly mined = new Map<number, MinedDay[]>();

  constructor(
    private readonly options: { startBack: number; lastSyncBack?: number; tolerancePct?: number }
  ) {
    const start = day(options.startBack, this.now);
    this.put(`corps/${CORP}`, {
      hubId: 'jita',
      oreForm: 'raw',
      graceHours: 0.5,
      overdueDays: 14,
      divisions: [1],
      startDate: start,
      structureExpiryHours: {},
      rates: [{ scope: 'corp', pct: RATE_PCT, effectiveFrom: start }],
      corporationId: CORP,
      active: true,
      ownerCharacterId: OFFICER.id,
      createdAt: this.now - options.startBack * DAY_MS,
      createdBy: OFFICER.id,
      // Synced just now: a visit does not sync again by itself (AUTO_SYNC_MIN_AGE_MS).
      lastSync: {
        at: this.now - (options.lastSyncBack ?? 0) * DAY_MS - 60_000,
        byCharacterId: OFFICER.id,
        byName: OFFICER.name,
        gaps: [],
      },
      ...(options.tolerancePct !== undefined ? { dayTolerancePct: options.tolerancePct } : {}),
      schemaVersion: 1,
    });
  }

  private put(path: string, data: Record<string, unknown>): this {
    this.out.set(path, data);
    return this;
  }

  private sub(name: string, id: string, data: Record<string, unknown>): this {
    return this.put(`corps/${CORP}/${name}/${id}`, data);
  }

  /** Observed Mining Entries: one row per mined day. */
  mine(characterId: number, days: readonly (number | MinedDay)[]): this {
    for (const entry of days) {
      const d: MinedDay = typeof entry === 'number' ? { back: entry } : entry;
      const refinery = REFINERY[d.refinery ?? 'alpha'];
      const date = day(d.back, this.now);
      this.mined.set(characterId, [...(this.mined.get(characterId) ?? []), d]);
      this.sub('observed', `${characterId}_${ORE_TYPE}_${date}_${refinery.id}`, {
        structureId: refinery.id,
        characterId,
        recordedCorporationId: recordedCorpOf(characterId),
        typeId: ORE_TYPE,
        date,
        quantity: d.qty ?? DAY_QTY,
        cachedAt: new Date(this.now - d.back * DAY_MS + 20 * HOUR_MS).toISOString(),
        solarSystemId: refinery.systemId,
        moonId: refinery.moonId,
        uid: `char:${characterId}`,
      });
    }
    return this;
  }

  /** A donation as the server stored it (`source: 'donation'`). */
  donation(p: Donation): this {
    const id = p.refId !== undefined ? `j1_${p.refId}` : p.id;
    return this.sub('payments', id, {
      id,
      source: 'donation',
      characterId: p.characterId,
      uid: `char:${p.characterId}`,
      amount: p.amount,
      at: noonOf(p.back, this.now),
      division: 1,
      ...(p.minerId ? { minerId: p.minerId } : {}),
      ...(p.reason ? { reason: p.reason } : {}),
      ...(p.reviewReason ? { reviewReason: p.reviewReason } : {}),
      ...(p.ambiguousMinerIds ? { ambiguousMinerIds: p.ambiguousMinerIds } : {}),
    });
  }

  /** A Miner grouping several Characters (`miners/{id}`), the first the main. */
  group(id: string, characterIds: readonly number[], createdBack = 60): this {
    return this.sub('miners', id, {
      id,
      characterIds: [...characterIds],
      mainCharacterId: characterIds[0],
      pendingConfirmation: [],
      officerClaimed: [],
      provenCharacterIds: [],
      confirmedCharacterIds: [],
      createdAt: new Date(this.now - createdBack * DAY_MS).toISOString(),
      uids: characterIds.map((c) => `char:${c}`),
    });
  }

  private noticeLines(input: NoticeInput) {
    const refinery = REFINERY[input.refinery ?? 'alpha'];
    return [...input.days]
      .sort((a, b) => b - a)
      .map((back) => {
        const date = day(back, this.now);
        const value = DAY_QTY * UNIT_PRICE;
        return {
          kind: 'mined',
          date,
          key: `${input.characterId}:${refinery.id}:${date}`,
          characterId: input.characterId,
          structureId: refinery.id,
          oreLines: [{ typeId: ORE_TYPE, quantity: DAY_QTY }],
          unitPrices: { [ORE_TYPE]: UNIT_PRICE },
          priceSources: { [ORE_TYPE]: 'historical' },
          taxPct: RATE_PCT,
          rateEffectiveFrom: day(this.options.startBack, this.now),
          estimatedValue: value,
          tax: (value * RATE_PCT) / 100,
        };
      });
  }

  /** The verify token's doc: what a verify link resolves (`corpTaxBookTokens/{token}`). */
  private token(input: NoticeInput, minerId: string): void {
    this.put(`corpTaxBookTokens/${input.token}`, {
      corporationId: CORP,
      statementId: input.id,
      minerId,
      remindersStopped: input.remindersStopped === true,
      createdAt: this.now - input.issuedBack * DAY_MS,
    });
  }

  /** What `legacyStatementDocOf` writes: the shape older tabs, and books from before the move, hold. */
  private legacyDoc(input: NoticeInput, minerId: string) {
    const lines = this.noticeLines(input);
    return {
      id: input.id,
      minerId,
      kind: 'notice',
      code: paymentCode(input.id),
      periodStart: lines[0].date,
      periodEnd: lines.at(-1)!.date,
      coversFrom: lines[0].date,
      coversThrough: lines.at(-1)!.date,
      issuedAt: new Date(this.now - input.issuedBack * DAY_MS).toISOString(),
      issuedBy: OFFICER.id,
      hubId: 'jita',
      oreForm: 'raw',
      lines: lines.map(({ key, ...line }) => ({ ...line, chargeKey: key })),
      amount: lines.reduce((sum, l) => sum + l.tax, 0),
      characterIds: [input.characterId],
      uids: [`char:${input.characterId}`],
      mailsSent: 1,
      manualRemindersSent: 0,
      remindersStopped: input.remindersStopped === true,
      corporationName: 'Test Corp',
      minerName: nameOf(input.characterId),
    };
  }

  /**
   * A Late notice as `issueLateNoticeDocs` writes it today: the `lateNotices` doc and its link,
   * the legacy mirror and its link older tabs read, and the verify token.
   */
  lateNotice(input: NoticeInput): this {
    const minerId = input.minerId ?? solo(input.characterId);
    const lines = this.noticeLines(input);
    this.sub('lateNotices', input.id, {
      id: input.id,
      minerId,
      characterIds: [input.characterId],
      kind: input.final ? 'final' : 'late',
      issuedAt: new Date(this.now - input.issuedBack * DAY_MS).toISOString(),
      issuedBy: OFFICER.id,
      code: paymentCode(input.id),
      pricing: { hubId: 'jita', oreForm: 'raw' },
      uids: [`char:${input.characterId}`],
      lines,
      listed: lines.reduce((sum, l) => sum + l.tax, 0),
      mail: { sent: 1, manualSent: 0, remindersStopped: input.remindersStopped === true },
      names: {
        corporationName: 'Test Corp',
        minerName: nameOf(input.characterId),
        refineryNames: Object.fromEntries(
          Object.values(REFINERY).map((r) => [String(r.id), r.name])
        ),
      },
    });
    this.sub('lateNoticeLinks', input.id, { token: input.token });
    return this.legacyNotice(input);
  }

  /**
   * A Late notice only in the legacy `statements` collection (`kind: 'notice'`) with its old
   * `statementLinks` verify link: a book from before the move to `lateNotices`.
   */
  legacyNotice(input: NoticeInput): this {
    const minerId = input.minerId ?? solo(input.characterId);
    this.sub('statements', input.id, this.legacyDoc(input, minerId));
    this.sub('statementLinks', input.id, { verifyToken: input.token });
    this.token(input, minerId);
    return this;
  }

  /** A Miner's word that they paid a notice another way, waiting on an officer. */
  declaration(p: {
    id: string;
    noticeId: string;
    kind?: 'contract' | 'other-division' | 'wrong-corp';
    amount?: number;
    note?: string;
    back: number;
    characterId: number;
  }): this {
    return this.sub('declarations', p.id, {
      id: p.id,
      statementId: p.noticeId,
      kind: p.kind ?? 'contract',
      at: noonOf(p.back, this.now),
      characterId: p.characterId,
      uid: `char:${p.characterId}`,
      ...(p.amount !== undefined ? { amount: p.amount } : {}),
      ...(p.note ? { note: p.note } : {}),
    });
  }

  /**
   * A Miner's open dispute of one mined day (`disputes/{minerId_date}`), as the member's
   * `disputeCorpTaxBookConflictCallable` stores it: it holds the day for 14 days.
   */
  dispute(p: {
    characterId: number;
    back: number;
    kind: 'quantity' | 'notPaying';
    reason: string;
    /** Units of the day's ore disputed. */
    qty: number;
    filedBack?: number;
    refinery?: RefineryKey;
  }): this {
    const minerId = solo(p.characterId);
    const date = day(p.back, this.now);
    const id = `${minerId.replace(/[^A-Za-z0-9_-]/g, '_')}_${date}`;
    return this.sub('disputes', id, {
      id,
      minerId,
      date,
      kind: p.kind,
      reason: p.reason,
      by: p.characterId,
      at: noonOf(p.filedBack ?? 1, this.now),
      uids: [`char:${p.characterId}`],
      lines: [
        {
          recordKey: `${p.characterId}:${REFINERY[p.refinery ?? 'alpha'].id}:${date}`,
          typeId: ORE_TYPE,
          quantity: p.qty,
          payeeName: '',
        },
      ],
    });
  }

  /** Any other doc under the book, in the server's layout. */
  raw(collection: string, id: string, data: Record<string, unknown>): this {
    return this.sub(collection, id, data);
  }

  docs(): SeedDoc[] {
    return [...this.out].map(([path, data]) => ({ path, data }));
  }
}
