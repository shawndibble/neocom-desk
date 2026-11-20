/**
 * A late notice (#6294, decisions 20261117-033049 and 20261117-043246): a record of what a Corp
 * Tax Book asked a Miner for, never a bill. Money pays the Miner's oldest unpaid day on their
 * account whatever code it carries, so a notice takes no payment and settles nothing; it reads as
 * settled once every day it listed is. A notice lists only the days no earlier notice listed.
 *
 * Shared by the client and the Cloud Functions (decision 20261117-230113): dependency-free, and
 * `src/engine/corpTaxBook/notice.ts` re-exports it.
 *
 * Notices are stored today as `corps/{id}/statements` docs with `kind: 'notice'`, in the shape of
 * the calendar Statement they replaced; `noticeFromStatementDoc` reads one into a `Notice`.
 */
import { isFiniteNumber, isRecord } from './guards.js';

/** `late`: the Miner is behind. `final`: their account was closed, so it is the last one. */
export type NoticeKind = 'late' | 'final';

/** One line of one day a notice asked for. */
export interface NoticeLine {
  date: string;
  /** The day charge, or `adjustment:<id>`, the line names: a later notice never lists it again. */
  key: string;
  characterId?: number;
  structureId?: number;
  /** What the line billed when the notice went out. */
  tax: number;
}

export interface NoticeMail {
  /** Mails the book recorded for it. */
  sent: number;
  lastAt?: string;
  /** Reminders an officer sent by hand; one is allowed after the Miner stopped them. */
  manualSent: number;
  /** The Miner chose "Stop reminders" (D27). */
  remindersStopped: boolean;
}

/** The names a guest's notice page prints: a guest cannot look a structure's name up (#4066). */
export interface NoticeNames {
  corporationName?: string;
  minerName?: string;
  refineryNames?: Record<string, string>;
}

export interface Notice {
  id: string;
  minerId: string;
  /** The Miner's characters when it went out: whose own lines it is. */
  characterIds: number[];
  kind: NoticeKind;
  issuedAt: string;
  /** The Character whose tab issued it. */
  issuedBy?: number;
  /** The Reason code the mail printed: a donation carrying it is this Miner's. */
  code: string;
  /** The new days it asked for, oldest first. */
  lines: NoticeLine[];
  /** What its lines billed when it went out (Σ line tax). */
  listed: number;
  mail: NoticeMail;
  names?: NoticeNames;
}

/** What a notice's days stand at, read off the Miner's account. */
export interface NoticeStanding {
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

/** The part of one account day `noticeStanding` reads (`DaySettlement` on the client). */
export interface NoticeDayState {
  tax: number;
  held: boolean;
  credited: number;
  forgiven: number;
  writtenOff: number;
  remaining: number;
  settled: boolean;
}

/** The id a closing account's last notice is stored under (`closeAccount`). */
const FINAL_PREFIX = 'final_';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined);

/** The key a stored line names: its day charge, else its Adjustment, else its date. */
export function lineKey(line: { chargeKey?: string; adjustmentId?: string; date: string }): string {
  return line.chargeKey ?? `adjustment:${line.adjustmentId ?? line.date}`;
}

/**
 * Reads a `statements` doc that holds a late notice. Undefined for anything else: a calendar
 * Statement is not a notice, and production holds none.
 */
export function noticeFromStatementDoc(raw: Record<string, unknown>): Notice | undefined {
  if (raw.kind !== 'notice') return undefined;
  const id = str(raw.id) ?? '';
  const lines: NoticeLine[] = (Array.isArray(raw.lines) ? raw.lines : [])
    .filter(isRecord)
    .flatMap((l) => {
      const date = str(l.date);
      if (!date) return [];
      const characterId = num(l.characterId);
      const structureId = num(l.structureId);
      return [
        {
          date,
          key: lineKey({ chargeKey: str(l.chargeKey), adjustmentId: str(l.adjustmentId), date }),
          ...(characterId !== undefined ? { characterId } : {}),
          ...(structureId !== undefined ? { structureId } : {}),
          tax: num(l.tax) ?? 0,
        },
      ];
    });
  const lastAt = str(raw.lastMailedAt);
  const issuedBy = num(raw.issuedBy);
  const names: NoticeNames = {
    ...(str(raw.minerName) ? { minerName: str(raw.minerName) } : {}),
    ...(str(raw.corporationName) ? { corporationName: str(raw.corporationName) } : {}),
    ...(isRecord(raw.refineryNames)
      ? {
          refineryNames: Object.fromEntries(
            Object.entries(raw.refineryNames).filter(
              (e): e is [string, string] => typeof e[1] === 'string'
            )
          ),
        }
      : {}),
  };
  return {
    id,
    minerId: str(raw.minerId) ?? '',
    characterIds: (Array.isArray(raw.characterIds) ? raw.characterIds : []).filter(isFiniteNumber),
    kind: id.startsWith(FINAL_PREFIX) ? 'final' : 'late',
    issuedAt: str(raw.issuedAt) ?? '',
    ...(issuedBy !== undefined ? { issuedBy } : {}),
    code: str(raw.code) ?? '',
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

/** Every line key any of these notices listed. */
export function listedKeys(notices: readonly Pick<Notice, 'lines'>[]): Set<string> {
  const out = new Set<string>();
  for (const n of notices) for (const l of n.lines) out.add(l.key);
  return out;
}

/**
 * A notice's standing on the Miner's account. Each date it listed counts at the share of that
 * day's tax its lines named (a day can grow after the notice went out); a held day is left out
 * of what is due, and a day that no longer bills anything reads as paid.
 */
export function noticeStanding(
  notice: Pick<Notice, 'lines'>,
  byDay: ReadonlyMap<string, NoticeDayState>
): NoticeStanding {
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

/**
 * The Reason code a Miner puts on a donation: one per Miner, since money pays their oldest day
 * whatever it names. The same hash and `MT` format as the codes notices already printed.
 */
export function minerPaymentCode(minerId: string): string {
  let h = 2166136261;
  for (const ch of `miner:${minerId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `MT${h.toString(36).toUpperCase().padStart(7, '0').slice(-6)}`;
}
