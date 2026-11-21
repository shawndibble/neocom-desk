/**
 * What the Corporation scope's stat chips need, from the corp book facts and the corp's
 * killmails with the player. A chip with nothing to say is null (the UI hides it). Pure.
 */
import { DAY_MS } from '@/lib/age';
import type { BookFacts } from './corpBookInteractions';
import type { CorpKill } from './corpOtherInteractions';

/** A loss counts as hostile for this long. */
export const HOSTILE_WINDOW_DAYS = 90;

export interface CorpMemberChips {
  owedNow: number | null;
  taxPaid: number | null;
  lateNotices: number | null;
  /** Epoch ms of the oldest record the corp book holds for them. */
  memberSince: number | null;
}

export interface CorpOutsiderChips {
  hostile: boolean;
  ourLosses: { count: number; isk: number } | null;
  theirLosses: { count: number; isk: number } | null;
  /** Epoch ms of the newest killmail between us. */
  lastHostile: number | null;
}

export interface CorpSummary {
  member: CorpMemberChips | null;
  outsider: CorpOutsiderChips | null;
}

const positive = (n: number): number | null => (n > 0 ? n : null);

export function summarizeCorpInteractions(input: {
  book: BookFacts | null;
  kills: readonly CorpKill[];
  isMember: boolean;
  now: number;
}): CorpSummary {
  const { book, kills, isMember, now } = input;

  let member: CorpMemberChips | null = null;
  if (isMember && book) {
    const stamps = [
      ...book.notices.map((n) => Date.parse(n.issuedAt)),
      ...book.payments.map((p) => Date.parse(p.at)),
      ...book.days.map((d) => Date.parse(d.date)),
    ].filter(Number.isFinite);
    member = {
      owedNow: positive(book.owed),
      taxPaid: positive(book.payments.reduce((sum, p) => sum + p.amount, 0)),
      lateNotices: positive(book.notices.length),
      memberSince: stamps.length > 0 ? Math.min(...stamps) : null,
    };
  }

  let outsider: CorpOutsiderChips | null = null;
  if (!isMember) {
    const total = (side: CorpKill['side']) => {
      const rows = kills.filter((k) => k.side === side);
      return rows.length === 0
        ? null
        : { count: rows.length, isk: rows.reduce((sum, k) => sum + (k.value ?? 0), 0) };
    };
    const since = now - HOSTILE_WINDOW_DAYS * DAY_MS;
    outsider = {
      hostile: kills.some((k) => k.side === 'weLost' && k.at >= since),
      ourLosses: total('weLost'),
      theirLosses: total('weKilled'),
      lastHostile: kills.length > 0 ? Math.max(...kills.map((k) => k.at)) : null,
    };
  }
  return { member, outsider };
}
