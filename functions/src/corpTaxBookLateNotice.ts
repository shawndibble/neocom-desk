import { isRecord } from './guards.js';
import { DAY_MS, utcDayOf } from './timeConstants.js';

export type LateNoticeKind = 'late' | 'final';

export type LateNoticeLineKind = 'mined' | 'late-ore' | 'correction';

export interface LateNoticeLine {
  kind: LateNoticeLineKind;
  date: string;
  key: string;
  characterId?: number;
  structureId?: number;
  oreLines: { typeId: number; quantity: number }[];
  unitPrices?: Record<number, number>;
  priceSources?: Record<number, string>;
  estimatedValue: number;
  taxPct?: number;
  rateEffectiveFrom?: string;
  reason?: string;
  tax: number;
}

export interface LateNoticeMail {
  sent: number;
  lastAt?: string;
  manualSent: number;
  remindersStopped: boolean;
}

export function reminderAllowed(mail: LateNoticeMail): boolean {
  return !mail.remindersStopped || mail.manualSent < 1;
}

export interface LateNoticeNames {
  corporationName?: string;
  minerName?: string;
  refineryNames?: Record<string, string>;
}

export interface LateNotice {
  id: string;
  minerId: string;
  characterIds: number[];
  kind: LateNoticeKind;
  issuedAt: string;
  issuedBy?: number;
  code?: string;
  pricing?: { hubId: string; oreForm: 'compressed' | 'raw' };
  uids: string[];
  lines: LateNoticeLine[];
  listed: number;
  mail: LateNoticeMail;
  names?: LateNoticeNames;
}

export interface LateNoticeStanding {
  due: number;
  held?: number;
  credited: number;
  forgiven: number;
  writtenOff: number;
  remaining: number;
  settled: boolean;
}

export interface LateNoticeDayState {
  tax: number;
  held: boolean;
  credited: number;
  forgiven: number;
  writtenOff: number;
  remaining: number;
  settled: boolean;
}

export const NOTICE_ID_FIELD = 'statementId';

const ADJUSTMENT_PREFIX = 'adjustment:';

const FINAL_PREFIX = 'final_';

export function noticeDocId(id: string): string {
  return id.replace(/[^A-Za-z0-9_:-]/g, '_');
}

export function isFinalNoticeId(id: string): boolean {
  return id.startsWith(FINAL_PREFIX);
}

export function finalNoticeId(minerId: string): string {
  return noticeDocId(`${FINAL_PREFIX}${minerId}`);
}

export function lineKey(line: { chargeKey?: string; adjustmentId?: string; date: string }): string {
  return line.chargeKey ?? adjustmentLineKey(line.adjustmentId ?? line.date);
}

export const adjustmentLineKey = (adjustmentId: string): string =>
  `${ADJUSTMENT_PREFIX}${adjustmentId}`;

export function noticeSpan(notice: { lines: readonly { date: string }[]; issuedAt: string }): {
  first: string;
  last: string;
} {
  const first = notice.lines[0]?.date ?? utcDayOf(notice.issuedAt);
  return { first, last: notice.lines.at(-1)?.date ?? first };
}

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

export function noticesOfDocs(docs: readonly unknown[]): LateNotice[] {
  return docs.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    if (typeof raw.id !== 'string' || typeof raw.minerId !== 'string') return [];
    if (!Array.isArray(raw.lines) || !isRecord(raw.mail)) return [];
    const { updatedAt: _stamp, ...rest } = raw;
    void _stamp;
    return [rest as unknown as LateNotice];
  });
}

type NoticedLines = {
  lines: readonly Pick<LateNoticeLine, 'kind' | 'date' | 'characterId'>[];
};

export function noticedDates(notices: readonly NoticedLines[], characterId?: number): Set<string> {
  const out = new Set<string>();
  for (const n of notices)
    for (const l of n.lines)
      if (l.kind !== 'correction' && (characterId === undefined || l.characterId === characterId))
        out.add(l.date);
  return out;
}

export function lastNoticedDay(notices: readonly NoticedLines[]): string | null {
  let last: string | null = null;
  for (const d of noticedDates(notices)) if (last === null || d > last) last = d;
  return last;
}

export function listedKeys(
  notices: readonly { lines: readonly Pick<LateNoticeLine, 'key'>[] }[]
): Set<string> {
  const out = new Set<string>();
  for (const n of notices) for (const l of n.lines) out.add(l.key);
  return out;
}

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
      if (!day.settled) settled = false;
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

export function paymentCode(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `MT${h.toString(36).toUpperCase().padStart(7, '0').slice(-6)}`;
}

export function minerPaymentCode(minerId: string): string {
  return paymentCode(`miner:${minerId}`);
}
