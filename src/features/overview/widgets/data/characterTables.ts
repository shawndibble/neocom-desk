import { fixed1 } from '@/lib/fixedFormat';
import type { DeadlineSeverity } from '@/engine/character/severity';
import { extractableSp, extractorCount } from '@/engine/skills/spExtraction';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { ContractTableRow } from '@/engine/contracts/contractsBoard';
import { formatCompactNumber } from '@/lib/compactNumber';
import { DAY_MS, HOUR_MS } from '@/lib/age';
import { formatCountdown } from '@/lib/duration';
import { formatIskCompact } from '@/lib/isk';
import { mailOpenHref, openHref } from '@/lib/highlightParam';
import type { BoardMail } from '../../data/boardData';
import { UNKNOWN } from './builderKit';
import { fractionBar } from './cellKit';
import { placeHead, shortPlaceName } from './placeName';
import type { SpExtras, TableCell, TableModel, TableRowModel } from './types';
import type { Translate } from '@/lib/translate';
import { highlightHref } from '@/lib/highlightParam';
import { createNumberFormat, formatNumber } from '@/lib/numberLocale';

const formatSp = createNumberFormat({ maximumFractionDigits: 3 });

const W = 'overview.widgets';
const CONTRACTS_PATH = '/contracts/history';

function instant(date: string | undefined): number | null {
  if (!date) return null;
  const ms = Date.parse(date);
  return Number.isNaN(ms) ? null : ms;
}

export interface TrainingAcceleratorRow {
  label: string;
  expiresAt: number;
  severity: DeadlineSeverity;
}

export function acceleratorSlot(finishes: readonly (number | null)[], expiresAt: number): number {
  return finishes.filter((finish) => finish !== null && finish <= expiresAt).length;
}

export function trainingTable(
  t: Translate,
  entries: readonly SkillQueueEntry[],
  now: number,
  nameOf: (skillId: number) => string,
  accelerator?: TrainingAcceleratorRow | null
): TableModel {
  let previousFinish: number | null = null;
  const rows: TableRowModel[] = [];
  const finishes: (number | null)[] = [];
  for (const entry of entries) {
    const finish = instant(entry.finish_date);
    if (finish !== null && finish <= now) continue;
    const declaredStart = instant(entry.start_date);
    const start = declaredStart ?? previousFinish;
    const hours = finish !== null && start !== null ? (finish - start) / HOUR_MS : 0;
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
      info: { typeId: entry.skill_id },
    });
    finishes.push(finish);
    if (finish !== null) previousFinish = finish;
  }
  if (accelerator) {
    rows.splice(acceleratorSlot(finishes, accelerator.expiresAt), 0, {
      key: 'accelerator',
      cells: [
        accelerator.label,
        formatCountdown(Math.max(0, accelerator.expiresAt - now) / 1000),
        '',
        '',
        '',
      ],
      tone: accelerator.severity,
    });
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

export interface SpTableInput {
  totalSp: number;
  unallocatedSp: number | null;
  extras: SpExtras;
}

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

export interface CalendarTableRow {
  key: string;
  subject: string;
  when: string;
  kind: string;
  tone: DeadlineSeverity;
  to: string;
}

export function calendarTable(t: Translate, rows: readonly CalendarTableRow[]): TableModel {
  return {
    columns: [
      { key: 'item', label: t(`${W}.comingUp.col.item`), priority: 0 },
      { key: 'in', label: t(`${W}.comingUp.col.in`), align: 'end', priority: 1 },
      { key: 'kind', label: t(`${W}.comingUp.col.kind`), priority: 2, grow: true },
    ],
    rows: rows.map((row) => ({
      key: row.key,
      cells: [row.subject, row.when, row.kind],
      tone: row.tone,
      to: row.to,
    })),
  };
}

const isk = (amount: number | null): TableCell =>
  amount === null || amount <= 0 ? UNKNOWN : { text: formatIskCompact(amount), iskAmount: amount };

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
      tone: item.overdue
        ? 'critical'
        : item.state === 'in_progress' && left <= DAY_MS
          ? 'warning'
          : 'clear',
      to: openHref(CONTRACTS_PATH, item.contractId),
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

export function mailTable(
  t: Translate,
  mails: readonly BoardMail[],
  ageText: (atMs: number | null) => string,
  ownerId: number | null
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
      to: mailOpenHref(mail.mailId, mail.ownerId ?? ownerId),
    })),
  };
}

export interface CloneTableRow {
  id: string | number;
  label: string;
  location: string | null;
  implantCount: number | null;
  totalSeconds: number | null;
  deltaSeconds: number | null;
}

const D = 'overview.widgets.data';

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
          row.label === row.location ? placeHead(row.label) : row.label,
          vs,
          row.totalSeconds === null ? UNKNOWN : formatCountdown(row.totalSeconds),
          row.implantCount === null ? UNKNOWN : String(row.implantCount),
          row.location === null ? UNKNOWN : placeHead(row.location),
        ],
        tone: 'clear',
        to: row.id === 'worn' ? undefined : highlightHref('/clones', row.id),
      };
    }),
  };
}

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
