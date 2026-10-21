/**
 * The Table views of the character-facing kinds (training, skill points,
 * coming up, contracts, mail): real columns, ordered name first, then the one
 * "key" figure, then the rest, each with the priority `visibleColumns` uses to
 * decide what survives a narrow widget. Pure: figures and a translate function
 * in, a `TableModel` out.
 */
import { fixed1 } from '@/lib/fixedFormat';
import type { DeadlineSeverity } from '@/engine/character/severity';
import { extractableSp, extractorCount } from '@/engine/skills/spExtraction';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { ContractTableRow } from '@/engine/contracts/contractsBoard';
import type { UpcomingCalendarEvent } from '@/engine/character/calendarDeadline';
import { formatCompactNumber } from '@/lib/compactNumber';
import { DAY_MS } from '@/lib/age';
import { formatCountdown } from '@/lib/duration';
import { formatIskCompact } from '@/lib/isk';
import type { BoardMail } from '../../data/boardData';
import { UNKNOWN } from './builderKit';
import { fractionBar } from './cellKit';
import { placeHead, shortPlaceName } from './placeName';
import type { SpExtras, TableCell, TableModel, TableRowModel, Translate } from './types';
import { createNumberFormat, formatNumber } from '@/lib/numberLocale';

// Part-trained levels bank fractional SP; the old default printed up to 3 decimals.
const formatSp = createNumberFormat({ maximumFractionDigits: 3 });

const W = 'overview.widgets';

/** `finish_date` as an instant, null when ESI gave none (a paused queue). */
function instant(date: string | undefined): number | null {
  if (!date) return null;
  const ms = Date.parse(date);
  return Number.isNaN(ms) ? null : ms;
}

// --- Training ------------------------------------------------------------------------

/**
 * The unfinished queue: skill, when it ends, how long it trains in all, the
 * level it reaches and SP per hour. SP per hour needs the entry's declared
 * start and SP figures, so a skill queued behind another shows no rate.
 */
export function trainingTable(
  t: Translate,
  entries: readonly SkillQueueEntry[],
  now: number,
  nameOf: (skillId: number) => string
): TableModel {
  let previousFinish: number | null = null;
  const rows: TableRowModel[] = [];
  for (const entry of entries) {
    const finish = instant(entry.finish_date);
    if (finish !== null && finish <= now) continue;
    const declaredStart = instant(entry.start_date);
    const start = declaredStart ?? previousFinish;
    const hours = finish !== null && start !== null ? (finish - start) / 3_600_000 : 0;
    const sp =
      entry.level_end_sp !== undefined && entry.training_start_sp !== undefined
        ? entry.level_end_sp - entry.training_start_sp
        : null;
    rows.push({
      key: `${entry.skill_id}:${entry.queue_position}`,
      cells: [
        nameOf(entry.skill_id),
        finish === null ? UNKNOWN : formatCountdown(Math.max(0, finish - now) / 1000),
        hours > 0 ? formatCountdown(hours * 3600) : UNKNOWN,
        String(entry.finished_level),
        declaredStart !== null && sp !== null && hours > 0
          ? formatCompactNumber(sp / hours)
          : UNKNOWN,
      ],
      tone: 'clear',
    });
    if (finish !== null) previousFinish = finish;
  }
  return {
    columns: [
      { key: 'skill', label: t(`${W}.training.col.skill`), priority: 0 },
      { key: 'endsIn', label: t(`${W}.training.col.endsIn`), align: 'end', priority: 1 },
      { key: 'takes', label: t(`${W}.training.col.takes`), align: 'end', priority: 2 },
      { key: 'level', label: t(`${W}.training.col.level`), align: 'end', priority: 3 },
      { key: 'spPerHour', label: t(`${W}.training.col.spPerHour`), align: 'end', priority: 4 },
    ],
    rows,
  };
}

// --- Skill points ----------------------------------------------------------------------

export interface SpTableInput {
  totalSp: number;
  /** Null when the skills read did not carry it. */
  unallocatedSp: number | null;
  extras: SpExtras;
}

/**
 * Total, unallocated and extractable SP as records. With extraction
 * monitoring on, a bar shows how far the extractable SP is toward the pilot's
 * threshold; with a priced hub, what the extractors are worth.
 */
export function spTable(t: Translate, input: SpTableInput): TableModel {
  const { totalSp, unallocatedSp, extras } = input;
  const extractable = extractableSp(totalSp);
  const extractors = extractorCount(totalSp);
  const ready = extras.monitoring && extractable >= extras.thresholdSp;
  const rows: TableRowModel[] = [
    {
      key: 'total',
      cells: [t('skills.totalSp'), formatSp(totalSp), ''],
    },
    {
      key: 'unallocated',
      cells: [
        t('skills.unallocatedSp'),
        unallocatedSp === null ? UNKNOWN : formatNumber(unallocatedSp),
        '',
      ],
    },
    {
      key: 'extractable',
      cells: [
        t(`${W}.sp.extractable`),
        formatCompactNumber(extractable),
        t(`${W}.sp.extractors`, { count: extractors }),
      ],
      tone: ready ? 'watch' : 'clear',
    },
  ];
  if (extras.monitoring && extras.thresholdSp > 0) {
    const share = fractionBar(extractable, extras.thresholdSp) ?? 0;
    rows.push({
      key: 'threshold',
      cells: [
        t(`${W}.sp.threshold`),
        // The bar and percentage sit in the key column so Small keeps them.
        { text: `${Math.floor(share * 100)}%`, bar: share },
        t(`${W}.sp.ofThreshold`, { sp: formatCompactNumber(extras.thresholdSp) }),
      ],
      tone: ready ? 'watch' : 'clear',
    });
  }
  const net = extras.price?.net ?? null;
  if (net !== null && extractors > 0) {
    const value = net * extractors;
    rows.push({
      key: 'value',
      cells: [
        t(`${W}.sp.value`),
        { text: formatIskCompact(value), iskAmount: value },
        extras.price.hubName,
      ],
    });
  }
  return {
    columns: [
      { key: 'measure', label: '', priority: 0 },
      { key: 'sp', label: t(`${W}.sp.col.sp`), align: 'end', priority: 1 },
      { key: 'detail', label: '', align: 'end', priority: 2 },
    ],
    rows,
  };
}

// --- Coming up -----------------------------------------------------------------------

export function comingUpTable(
  t: Translate,
  events: readonly UpcomingCalendarEvent[],
  now: number,
  toneOf: (atMs: number, now: number) => DeadlineSeverity
): TableModel {
  return {
    columns: [
      { key: 'event', label: t(`${W}.comingUp.col.event`), priority: 0 },
      { key: 'in', label: t(`${W}.comingUp.col.in`), align: 'end', priority: 1 },
      { key: 'response', label: t(`${W}.comingUp.col.response`), priority: 2 },
    ],
    rows: events.map((event) => ({
      key: String(event.eventId),
      cells: [
        event.title,
        formatCountdown((event.atMs - now) / 1000),
        t(`overview.board.response.${event.response}`),
      ],
      tone: toneOf(event.atMs, now),
    })),
  };
}

// --- Contracts -----------------------------------------------------------------------

const isk = (amount: number | null): TableCell =>
  amount === null || amount <= 0 ? UNKNOWN : { text: formatIskCompact(amount), iskAmount: amount };

/** Each haul in progress and outstanding contract: where it goes (or what it is), when it lapses, what it pays. */
export function contractsTable(
  t: Translate,
  items: readonly ContractTableRow[],
  routes: Readonly<Record<number, readonly [string, string]>> | undefined,
  now: number
): TableModel {
  const rows: TableRowModel[] = items.map((item) => {
    const route = routes?.[item.contractId];
    const courier = item.kind === 'courier';
    const name = courier
      ? route
        ? `${shortPlaceName(route[0])} → ${shortPlaceName(route[1])}`
        : (item.title ?? t(`${W}.contracts.courier`))
      : (item.title ?? t(`${W}.contracts.listing`));
    const left = item.atMs - now;
    return {
      key: String(item.contractId),
      cells: [
        name,
        item.overdue ? t(`${W}.contracts.overdue`) : formatCountdown(left / 1000),
        item.state === 'outstanding'
          ? t(`${W}.contracts.statusOutstanding`)
          : t(`${W}.contracts.${item.overdue ? 'statusOverdue' : 'statusTransit'}`),
        isk(courier ? item.reward : item.price),
        isk(courier ? item.collateral : null),
      ],
      // Overdue is the only red; anything due within a day is an amber heads-up.
      tone: item.overdue
        ? 'critical'
        : item.state === 'in_progress' && left <= DAY_MS
          ? 'warning'
          : 'clear',
    };
  });
  return {
    columns: [
      { key: 'contract', label: t(`${W}.contracts.col.contract`), priority: 0 },
      { key: 'expires', label: t(`${W}.contracts.col.expires`), align: 'end', priority: 1 },
      { key: 'status', label: t(`${W}.contracts.col.status`), priority: 2, hideNarrow: true },
      { key: 'reward', label: t(`${W}.contracts.col.reward`), align: 'end', priority: 3 },
      {
        key: 'collateral',
        label: t(`${W}.contracts.col.collateral`),
        align: 'end',
        priority: 4,
        hideNarrow: true,
      },
    ],
    rows,
  };
}

// --- Mail ---------------------------------------------------------------------------

/** The newest mail: who, how long ago, what. Unread rows carry the watch tone. */
export function mailTable(
  t: Translate,
  mails: readonly BoardMail[],
  ageText: (atMs: number | null) => string
): TableModel {
  return {
    columns: [
      { key: 'from', label: t(`${W}.mail.col.from`), priority: 0 },
      { key: 'age', label: t(`${W}.mail.col.age`), align: 'end', priority: 1 },
      { key: 'subject', label: t(`${W}.mail.col.subject`), priority: 2, grow: true },
    ],
    rows: mails.map((mail) => ({
      key: String(mail.mailId),
      cells: [
        mail.from ?? t(`${W}.mail.unknownSender`),
        ageText(mail.atMs),
        mail.subject || t('overview.board.mailNoSubject'),
      ],
      tone: mail.unread === false ? 'clear' : 'watch',
    })),
  };
}

// --- Clones --------------------------------------------------------------------------

export interface CloneTableRow {
  id: string | number;
  label: string;
  location: string | null;
  implantCount: number | null;
  totalSeconds: number | null;
  deltaSeconds: number | null;
}

const D = 'overview.widgets.data';

/** Each clone against the one being worn: how long the queue takes in it, the saving, implants, where. */
export function clonesTable(t: Translate, rows: readonly CloneTableRow[]): TableModel {
  return {
    columns: [
      { key: 'clone', label: t(`${D}.clones.col.clone`), priority: 0 },
      { key: 'vs', label: t(`${D}.clones.col.vs`), align: 'end', priority: 1 },
      { key: 'finishes', label: t(`${D}.clones.col.finishes`), align: 'end', priority: 2 },
      { key: 'implants', label: t(`${D}.clones.col.implants`), align: 'end', priority: 3 },
      { key: 'location', label: t(`${D}.clones.col.location`), priority: 4 },
    ],
    rows: rows.map((row) => {
      const delta = row.deltaSeconds;
      const vs: TableCell =
        row.id === 'worn' || delta === null
          ? UNKNOWN
          : Math.abs(delta) < 60
            ? t(`${D}.clones.baseline`)
            : delta < 0
              ? {
                  text: t(`${D}.clones.soonerBy`, { duration: formatCountdown(-delta) }),
                  tone: 'good',
                }
              : t(`${D}.clones.laterBy`, { duration: formatCountdown(delta) });
      return {
        key: String(row.id),
        cells: [
          // A clone named only by where it sits does not repeat the owner and moon in its name.
          row.label === row.location ? placeHead(row.label) : row.label,
          vs,
          row.totalSeconds === null ? UNKNOWN : formatCountdown(row.totalSeconds),
          row.implantCount === null ? UNKNOWN : String(row.implantCount),
          row.location === null ? UNKNOWN : placeHead(row.location),
        ],
        tone: 'clear',
      };
    }),
  };
}

// --- Location ------------------------------------------------------------------------

/** High-sec reads green, low-sec amber, null-sec and below red, by the one-decimal figure the client shows. */
function securityTone(security: number): 'good' | 'caution' | 'bad' {
  const shown = Math.round(security * 10) / 10;
  return shown >= 0.5 ? 'good' : shown >= 0.1 ? 'caution' : 'bad';
}

export function locationTable(
  t: Translate,
  input: { system: string; security: number | null; ship: string | null }
): TableModel {
  const rows: TableRowModel[] = [
    { key: 'system', cells: [t(`${D}.location.system`), input.system] },
  ];
  if (input.security !== null) {
    rows.push({
      key: 'security',
      cells: [
        t(`${D}.location.securityLabel`),
        { text: fixed1(input.security), tone: securityTone(input.security) },
      ],
    });
  }
  rows.push({ key: 'ship', cells: [t(`${D}.location.ship`), input.ship ?? UNKNOWN] });
  return {
    columns: [
      { key: 'label', label: '', priority: 0 },
      { key: 'value', label: '', align: 'end', priority: 1 },
    ],
    rows,
  };
}
