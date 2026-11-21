/**
 * A late notice (#6294, decisions 20261117-033049 and 20261117-043246): a record of what a Corp
 * Tax Book asked a Miner for, never a bill. Money pays the Miner's oldest unpaid day on their
 * account whatever code it carries, so a notice takes no payment and settles nothing; it reads as
 * settled once every day it listed is. A notice lists only the days no earlier notice listed.
 *
 * Shared by the client and the Cloud Functions (decision 20261117-230113): dependency-free, and
 * `src/engine/corpTaxBook/notice.ts` re-exports it.
 *
 * Notices are stored as `corps/{id}/lateNotices` docs in this shape. Each is mirrored to a legacy
 * `statements` doc (`kind: 'notice'`, `legacyStatementDocOf`) for older tabs until the soak ends;
 * `lateNoticeFromStatementDoc` reads one of those, or an older one, into a `LateNotice`.
 */
import { isFiniteNumber, isRecord } from './guards.js';
import { DAY_MS, utcDayOf } from './timeConstants.js';

/** `late`: the Miner is behind. `final`: their account was closed, so it is the last one. */
export type LateNoticeKind = 'late' | 'final';

/** `mined` and `late-ore` bill a day charge's ore; `correction` bills an officer's Adjustment. */
export type LateNoticeLineKind = 'mined' | 'late-ore' | 'correction';

/** One line of one day a notice asked for, as it was priced when the notice went out. */
export interface LateNoticeLine {
  kind: LateNoticeLineKind;
  date: string;
  /** The day charge, or `adjustment:<id>`, the line names: a later notice never lists it again. */
  key: string;
  characterId?: number;
  structureId?: number;
  /** The ore it billed (for late ore, only the growth). */
  oreLines: { typeId: number; quantity: number }[];
  /** Per-unit price by raw type id, and which price tier priced each: printed on the verify page. */
  unitPrices?: Record<number, number>;
  priceSources?: Record<number, string>;
  estimatedValue: number;
  taxPct?: number;
  /** The rate's effective-from date (D28); absent for a per-record override. */
  rateEffectiveFrom?: string;
  /** A correction's reason. */
  reason?: string;
  /** What the line billed when the notice went out. */
  tax: number;
}

export interface LateNoticeMail {
  /** Mails the book recorded for it. */
  sent: number;
  lastAt?: string;
  /** Reminders an officer sent by hand; one is allowed after the Miner stopped them. */
  manualSent: number;
  /** The Miner chose "Stop reminders" (D27). */
  remindersStopped: boolean;
}

/** D27: reminders run until the Miner stops them; after that an officer may send one by hand. */
export function reminderAllowed(mail: LateNoticeMail): boolean {
  return !mail.remindersStopped || mail.manualSent < 1;
}

/** The names a guest's notice page prints: a guest cannot look a structure's name up (#4066). */
export interface LateNoticeNames {
  corporationName?: string;
  minerName?: string;
  refineryNames?: Record<string, string>;
}

export interface LateNotice {
  id: string;
  minerId: string;
  /** The Miner's characters when it went out: whose own lines it is. */
  characterIds: number[];
  kind: LateNoticeKind;
  issuedAt: string;
  /** The Character whose tab issued it. */
  issuedBy?: number;
  /** The Reason code the mail printed, when it printed one: a donation carrying it is this Miner's. */
  code?: string;
  /** The book's trade hub and Ore Form its lines were priced at (D11). */
  pricing?: { hubId: string; oreForm: 'compressed' | 'raw' };
  /** Who may read it (`char:<id>`): the Miner's characters and anyone claiming them. */
  uids: string[];
  /** The new days it asked for, oldest first. */
  lines: LateNoticeLine[];
  /** What its lines billed when it went out (Σ line tax). */
  listed: number;
  mail: LateNoticeMail;
  names?: LateNoticeNames;
}

/** What a notice's days stand at, read off the Miner's account. */
export interface LateNoticeStanding {
  /** What its days still bill, less what open disputes hold. */
  due: number;
  /** What open disputes hold of its days; absent when nothing is held. */
  held?: number;
  credited: number;
  forgiven: number;
  writtenOff: number;
  remaining: number;
  /** Every day it listed is paid, forgiven or no longer billed. */
  settled: boolean;
}

/** The part of one account day `lateNoticeStanding` reads (`DaySettlement` on the client). */
export interface LateNoticeDayState {
  tax: number;
  held: boolean;
  credited: number;
  forgiven: number;
  writtenOff: number;
  remaining: number;
  settled: boolean;
}

/**
 * The field a declaration and a verify token name their Late notice by: the wire name they had
 * when notices were stored as Statements, which every deployed client reads.
 */
export const NOTICE_ID_FIELD = 'statementId';

/** A line key that names an Adjustment rather than a day charge. */
const ADJUSTMENT_PREFIX = 'adjustment:';

/** The id a closing account's last notice is stored under (`closeAccount`). */
const FINAL_PREFIX = 'final_';

/** A notice id made safe for a Firestore doc id: a Miner id may carry any character. */
export function noticeDocId(id: string): string {
  return id.replace(/[^A-Za-z0-9_:-]/g, '_');
}

/** Whether an id is a final notice's: only closing an account issues one. */
export function isFinalNoticeId(id: string): boolean {
  return id.startsWith(FINAL_PREFIX);
}

/**
 * A notice's mail state from both docs that hold it while the legacy mirror lives: reminders are
 * stopped if either says so, each count is the larger, the last mail the later.
 */
export function mergeNoticeMail(a: LateNoticeMail, b: LateNoticeMail): LateNoticeMail {
  const lastAt = [a.lastAt, b.lastAt]
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  return {
    sent: Math.max(a.sent, b.sent),
    ...(lastAt ? { lastAt } : {}),
    manualSent: Math.max(a.manualSent, b.manualSent),
    remindersStopped: a.remindersStopped || b.remindersStopped,
  };
}

/** The id of the final notice closing `minerId`'s account sends. */
export function finalNoticeId(minerId: string): string {
  return noticeDocId(`${FINAL_PREFIX}${minerId}`);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined);
/** A stored `{ key: string }` map, or undefined when there is none. */
function stringRecord(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  return Object.fromEntries(
    Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string')
  );
}
/** A stored `{ typeId: number }` map, or undefined when there is none. */
function numberRecord(v: unknown): Record<number, number> | undefined {
  if (!isRecord(v)) return undefined;
  return Object.fromEntries(
    Object.entries(v).filter((e): e is [string, number] => isFiniteNumber(e[1]))
  );
}

/** The key a stored line names: its day charge, else its Adjustment, else its date. */
export function lineKey(line: { chargeKey?: string; adjustmentId?: string; date: string }): string {
  return line.chargeKey ?? adjustmentLineKey(line.adjustmentId ?? line.date);
}

/** The key a correction's line carries (`adjustment:<id>`): a later notice never lists it again. */
export const adjustmentLineKey = (adjustmentId: string): string =>
  `${ADJUSTMENT_PREFIX}${adjustmentId}`;

/** The first and last day a notice listed (its lines are oldest first); its issue day with none. */
export function noticeSpan(notice: { lines: readonly { date: string }[]; issuedAt: string }): {
  first: string;
  last: string;
} {
  const first = notice.lines[0]?.date ?? utcDayOf(notice.issuedAt);
  return { first, last: notice.lines.at(-1)?.date ?? first };
}

/**
 * Reads a `statements` doc that holds a late notice. Undefined for anything else: a calendar
 * Statement is not a notice, and production holds none.
 */
export function lateNoticeFromStatementDoc(raw: Record<string, unknown>): LateNotice | undefined {
  if (raw.kind !== 'notice') return undefined;
  const id = str(raw.id) ?? '';
  const lines: LateNoticeLine[] = (Array.isArray(raw.lines) ? raw.lines : [])
    .filter(isRecord)
    .flatMap((l): LateNoticeLine[] => {
      const date = str(l.date);
      if (!date) return [];
      const kind: LateNoticeLineKind =
        l.kind === 'late-ore' || l.kind === 'correction' ? l.kind : 'mined';
      const opt = <K extends string, V>(key: K, value: V | undefined) =>
        (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;
      return [
        {
          kind,
          date,
          key: lineKey({ chargeKey: str(l.chargeKey), adjustmentId: str(l.adjustmentId), date }),
          ...opt('characterId', num(l.characterId)),
          ...opt('structureId', num(l.structureId)),
          oreLines: (Array.isArray(l.oreLines) ? l.oreLines : []).filter(isRecord).flatMap((o) => {
            const typeId = num(o.typeId);
            const quantity = num(o.quantity);
            return typeId !== undefined && quantity !== undefined ? [{ typeId, quantity }] : [];
          }),
          ...opt('unitPrices', numberRecord(l.unitPrices)),
          ...opt('priceSources', stringRecord(l.priceSources)),
          estimatedValue: num(l.estimatedValue) ?? 0,
          ...opt('taxPct', num(l.taxPct)),
          ...opt('rateEffectiveFrom', str(l.rateEffectiveFrom)),
          ...opt('reason', str(l.reason)),
          tax: num(l.tax) ?? 0,
        },
      ];
    });
  const lastAt = str(raw.lastMailedAt);
  const issuedBy = num(raw.issuedBy);
  const names: LateNoticeNames = {
    ...(str(raw.minerName) ? { minerName: str(raw.minerName) } : {}),
    ...(str(raw.corporationName) ? { corporationName: str(raw.corporationName) } : {}),
    ...(stringRecord(raw.refineryNames) ? { refineryNames: stringRecord(raw.refineryNames) } : {}),
  };
  return {
    id,
    minerId: str(raw.minerId) ?? '',
    characterIds: (Array.isArray(raw.characterIds) ? raw.characterIds : []).filter(isFiniteNumber),
    kind: isFinalNoticeId(id) ? 'final' : 'late',
    issuedAt: str(raw.issuedAt) ?? '',
    ...(issuedBy !== undefined ? { issuedBy } : {}),
    // An empty code would match every donation's reason: no code is printed instead.
    ...(str(raw.code) ? { code: str(raw.code) } : {}),
    ...(typeof raw.hubId === 'string' && (raw.oreForm === 'compressed' || raw.oreForm === 'raw')
      ? { pricing: { hubId: raw.hubId, oreForm: raw.oreForm } }
      : {}),
    uids: (Array.isArray(raw.uids) ? raw.uids : []).filter(
      (u): u is string => typeof u === 'string'
    ),
    lines,
    listed: lines.reduce((sum, l) => sum + l.tax, 0),
    mail: {
      sent: num(raw.mailsSent) ?? 0,
      ...(lastAt ? { lastAt } : {}),
      manualSent: num(raw.manualRemindersSent) ?? 0,
      remindersStopped: raw.remindersStopped === true,
    },
    ...(Object.keys(names).length > 0 ? { names } : {}),
  };
}

/** The legacy store's hub and Ore Form when a notice carries none: what a book defaults to. */
const DEFAULT_PRICING = { hubId: 'jita', oreForm: 'compressed' } as const;

/**
 * The `statements` doc an older tab reads a late notice from, until the `statements` mirror goes
 * (decision 20261120-235011, step 5): the inverse of `lateNoticeFromStatementDoc`.
 */
export function legacyStatementDocOf(notice: LateNotice): Record<string, unknown> {
  const { first, last } = noticeSpan(notice);
  const pricing = notice.pricing ?? DEFAULT_PRICING;
  return {
    id: notice.id,
    minerId: notice.minerId,
    kind: 'notice',
    ...(notice.code ? { code: notice.code } : {}),
    periodStart: first,
    periodEnd: last,
    coversFrom: first,
    coversThrough: last,
    issuedAt: notice.issuedAt,
    ...(notice.issuedBy !== undefined ? { issuedBy: notice.issuedBy } : {}),
    hubId: pricing.hubId,
    oreForm: pricing.oreForm,
    lines: notice.lines.map(({ key, ...line }) =>
      key.startsWith(ADJUSTMENT_PREFIX)
        ? { ...line, adjustmentId: key.slice(ADJUSTMENT_PREFIX.length) }
        : { ...line, chargeKey: key }
    ),
    amount: notice.listed,
    characterIds: notice.characterIds,
    uids: notice.uids,
    mailsSent: notice.mail.sent,
    ...(notice.mail.lastAt ? { lastMailedAt: notice.mail.lastAt } : {}),
    manualRemindersSent: notice.mail.manualSent,
    remindersStopped: notice.mail.remindersStopped,
    ...notice.names,
  };
}

/**
 * Why a new notice is not sent, or null: a line another notice already listed (a notice lists only
 * new days), or the cooldown since the Miner's last late notice (`cooldownDays`) has not passed. So
 * two tabs never mail the same days. A final notice starts no cooldown.
 */
export function lateNoticeRefusal(
  notice: { lines: readonly Pick<LateNoticeLine, 'key'>[] },
  earlier: readonly {
    issuedAt: string;
    kind?: LateNoticeKind;
    lines: readonly Pick<LateNoticeLine, 'key'>[];
  }[],
  cooldownDays: number,
  now: string
): 'already-listed' | 'notice-cooldown' | null {
  const listed = listedKeys(earlier);
  if (notice.lines.some((l) => listed.has(l.key))) return 'already-listed';
  const last = earlier
    .filter((n) => n.kind !== 'final')
    .map((n) => Date.parse(n.issuedAt))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a)[0];
  if (last !== undefined && Date.parse(now) - last < cooldownDays * DAY_MS)
    return 'notice-cooldown';
  return null;
}

/**
 * The Late notices stored in both collections, one per id (decision 20261120-235011): a
 * `lateNotices` doc (`current`, its server stamp dropped) wins, with its mail state read from its
 * legacy copy too (`mergeNoticeMail`); a legacy doc with no copy is read as its notice; anything
 * that is no notice (a malformed doc, a calendar Statement) is left out.
 */
export function mergeNoticeDocs(
  current: readonly Record<string, unknown>[],
  legacy: readonly Record<string, unknown>[]
): LateNotice[] {
  const old = new Map<string, LateNotice>();
  for (const raw of legacy) {
    const notice = lateNoticeFromStatementDoc(raw);
    if (notice?.id && notice.minerId) old.set(notice.id, notice);
  }
  const out = new Map(old);
  for (const raw of current) {
    if (typeof raw.id !== 'string' || typeof raw.minerId !== 'string') continue;
    if (!Array.isArray(raw.lines) || !isRecord(raw.mail)) continue;
    const { updatedAt: _stamp, ...rest } = raw;
    void _stamp;
    const notice = rest as unknown as LateNotice;
    const copy = old.get(notice.id);
    out.set(
      notice.id,
      copy ? { ...notice, mail: mergeNoticeMail(notice.mail, copy.mail) } : notice
    );
  }
  return [...out.values()];
}

/** A notice as the date rules read it: its lines' kinds, days and Characters. */
type NoticedLines = {
  lines: readonly Pick<LateNoticeLine, 'kind' | 'date' | 'characterId'>[];
};

/**
 * The days these notices listed: each mined or late-ore line's day (a correction bills no day),
 * one Character's alone when `characterId` is given. A day between two listed days was not
 * listed. What an issued notice asked never changes, so the date rules refuse to reprice these.
 */
export function noticedDates(notices: readonly NoticedLines[], characterId?: number): Set<string> {
  const out = new Set<string>();
  for (const n of notices)
    for (const l of n.lines)
      if (l.kind !== 'correction' && (characterId === undefined || l.characterId === characterId))
        out.add(l.date);
  return out;
}

/** The latest day any of these notices listed, or null with none. */
export function lastNoticedDay(notices: readonly NoticedLines[]): string | null {
  let last: string | null = null;
  for (const d of noticedDates(notices)) if (last === null || d > last) last = d;
  return last;
}

/** Every line key any of these notices listed. */
export function listedKeys(
  notices: readonly { lines: readonly Pick<LateNoticeLine, 'key'>[] }[]
): Set<string> {
  const out = new Set<string>();
  for (const n of notices) for (const l of n.lines) out.add(l.key);
  return out;
}

/**
 * A notice's standing on the Miner's account. Each date it listed counts at the share of that
 * day's tax its lines named (a day can grow after the notice went out); a held day is left out
 * of what is due, and a day that no longer bills anything reads as paid.
 */
export function lateNoticeStanding(
  notice: { lines: readonly Pick<LateNoticeLine, 'date' | 'tax'>[] },
  byDay: ReadonlyMap<string, LateNoticeDayState>
): LateNoticeStanding {
  const byDate = new Map<string, number>();
  for (const l of notice.lines) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.tax);
  const out = { due: 0, held: 0, credited: 0, forgiven: 0, writtenOff: 0, remaining: 0 };
  let settled = true;
  for (const [date, tax] of byDate) {
    if (tax <= 0) continue;
    const day = byDay.get(date);
    if (!day || day.tax <= 0) {
      out.due += tax;
      out.credited += tax;
      continue;
    }
    const share = Math.min(1, tax / day.tax);
    if (day.held) {
      out.held += tax;
      continue;
    }
    out.due += tax;
    out.credited += day.credited * share;
    out.forgiven += day.forgiven * share;
    out.writtenOff += day.writtenOff * share;
    out.remaining += day.remaining * share;
    if (!day.settled) settled = false;
  }
  const { held, ...rest } = out;
  return { ...rest, ...(held > 0 ? { held } : {}), settled };
}

/** A short Reason code, `MT` and six characters, hashed from `seed` (FNV-1a). */
export function paymentCode(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `MT${h.toString(36).toUpperCase().padStart(7, '0').slice(-6)}`;
}

/**
 * The Reason code a Miner puts on a donation: one per Miner, since money pays their oldest day
 * whatever it names. Codes printed on notices already mailed were `paymentCode(notice id)`.
 */
export function minerPaymentCode(minerId: string): string {
  return paymentCode(`miner:${minerId}`);
}
