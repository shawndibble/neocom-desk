/**
 * The Corp Tax Book as one workbook (#4946): a sheet per record type, every record the officer
 * can read, names beside ids so the file reads for a person and still joins for a script.
 * Pure: the caller reads the book and hands the sheets to `downloadWorkbook`.
 */
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { RecordedWriteOff } from '@/engine/corpTaxBook/allocation';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { Adjustment, Statement } from '@/engine/corpTaxBook/statements';
import type { SettlePayment } from '@/engine/corpTaxBook/sync';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { ExportValue } from '@/lib/exportCells';
import type { XlsxSheet } from '@/lib/xlsx';
import type { AuditEntry, BookSettings } from '../taxBook/bookClient';
import type { BookNames } from './useCorpBook';

export interface BookExportInput {
  settings: BookSettings;
  miners: readonly Miner[];
  observed: readonly ObservedRow[];
  statements: readonly Statement[];
  paidStatementIds: ReadonlySet<string>;
  payments: readonly SettlePayment[];
  adjustments: readonly Adjustment[];
  writeOffs: readonly RecordedWriteOff[];
  dismissals: readonly Dismissal[];
  audit: readonly AuditEntry[];
}

export type BookExportNames = Pick<BookNames, 'character' | 'refinery' | 'moon' | 'ore'>;

/** Epoch ms as a UTC timestamp, which the writer turns into a date cell. */
export const isoTime = (ms: number | null | undefined): string | null =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

/** A list in one cell. */
export const joined = (values: readonly (string | number)[]): string => values.join('; ');

const byKey =
  <T>(...keys: ((row: T) => string | number)[]) =>
  (a: T, b: T): number => {
    for (const key of keys) {
      const x = key(a);
      const y = key(b);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };

/** A sheet of rows, sorted, with columns given as `[i18n key, value]`. */
function sheet<T>(
  t: CsvTranslate,
  name: string,
  rows: readonly T[],
  columns: [key: string, value: (row: T) => ExportValue][]
): XlsxSheet<T> {
  return {
    name: t(`corpTaxBook.export.sheets.${name}`),
    rows,
    columns: columns.map(([key, value]): CsvColumn<T> => ({
      header: t(`corpTaxBook.export.cols.${key}`),
      value,
    })),
  };
}

function rateTarget(rate: TaxRate, names: BookExportNames): string | null {
  switch (rate.scope) {
    case 'corp':
    case 'guest':
      return null;
    case 'feeder':
      return String(rate.feederId);
    case 'miner':
      return rate.minerId;
    case 'moon':
      return names.moon(rate.moonId);
    case 'structure':
      return names.refinery(rate.structureId);
    case 'record':
      return rate.recordKey;
  }
}

function settingsRows(
  s: BookSettings,
  names: BookExportNames,
  t: CsvTranslate
): [string, ExportValue][] {
  const yes = t('corpTaxBook.export.yes');
  const no = t('corpTaxBook.export.no');
  const label = (key: string, options?: Record<string, unknown>) =>
    t(`corpTaxBook.export.setting.${key}`, options);
  const cadence =
    s.cadence.kind === 'monthly'
      ? label('cadenceMonthly')
      : label('cadenceDays', { days: s.cadence.days, anchor: s.cadence.anchor });
  return [
    [label('active'), s.active ? yes : no],
    [label('startDate'), s.startDate],
    [label('hub'), s.hubId],
    [label('oreForm'), s.oreForm],
    [label('cadence'), cadence],
    [label('graceHours'), s.graceHours],
    [label('minimumStatement'), s.minimumStatement],
    [label('overdueDays'), s.overdueDays],
    [label('divisions'), joined(s.divisions)],
    [label('approvalLimit'), s.dismissApprovalAboveIsk],
    [label('chunkM3PerHour'), s.chunkM3PerHour],
    [label('owner'), s.ownerCharacterId === null ? null : names.character(s.ownerCharacterId)],
    [label('createdBy'), s.createdBy === null ? null : names.character(s.createdBy)],
    [label('lastSync'), isoTime(s.lastSync?.at)],
    ...s.rates.map((rate): [string, ExportValue] => [
      label(`rate.${rate.scope}`, {
        target: rateTarget(rate, names),
        from: 'effectiveFrom' in rate ? rate.effectiveFrom : '',
      }),
      rate.pct,
    ]),
  ];
}

export function bookExportSheets(
  input: BookExportInput,
  names: BookExportNames,
  t: CsvTranslate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each sheet has its own row type
): XlsxSheet<any>[] {
  const yes = t('corpTaxBook.export.yes');
  const no = t('corpTaxBook.export.no');
  const minerById = new Map(input.miners.map((m) => [m.id, m]));
  const minerIdOf = new Map(input.miners.flatMap((m) => m.characterIds.map((c) => [c, m.id])));
  /** A grouped Miner by its main character; a `solo:<id>` one by its only character. */
  const minerName = (minerId: string | undefined): string | null => {
    if (!minerId) return null;
    const miner = minerById.get(minerId);
    if (miner) return names.character(miner.mainCharacterId);
    const solo = /^solo:(\d+)$/.exec(minerId);
    return solo ? names.character(Number(solo[1])) : minerId;
  };
  const minerOf = (characterId: number) => minerIdOf.get(characterId) ?? `solo:${characterId}`;
  const character = (id: number | null | undefined) =>
    typeof id === 'number' ? names.character(id) : null;

  return [
    sheet(
      t,
      'miningLines',
      [...input.observed].sort(
        byKey(
          (r) => r.date,
          (r) => r.characterId,
          (r) => r.structureId,
          (r) => r.typeId
        )
      ),
      [
        ['date', (r) => r.date],
        ['character', (r) => names.character(r.characterId)],
        ['characterId', (r) => r.characterId],
        ['miner', (r) => minerName(minerOf(r.characterId))],
        ['minerId', (r) => minerOf(r.characterId)],
        ['corporationId', (r) => r.recordedCorporationId],
        ['refinery', (r) => names.refinery(r.structureId)],
        ['refineryId', (r) => r.structureId],
        ['moon', (r) => (r.moonId === undefined ? null : names.moon(r.moonId))],
        ['moonId', (r) => r.moonId],
        ['systemId', (r) => r.solarSystemId],
        ['ore', (r) => names.ore(r.typeId)],
        ['typeId', (r) => r.typeId],
        ['quantity', (r) => r.quantity],
        ['moonOwnerId', (r) => r.sourceCorporationId],
        ['readAt', (r) => r.cachedAt],
      ]
    ),
    sheet(
      t,
      'statements',
      [...input.statements].sort(
        byKey(
          (s) => s.issuedAt,
          (s) => s.id
        )
      ),
      [
        ['statementId', (s) => s.id],
        ['miner', (s) => minerName(s.minerId)],
        ['minerId', (s) => s.minerId],
        ['code', (s) => s.code],
        ['periodStart', (s) => s.periodStart],
        ['periodEnd', (s) => s.periodEnd],
        ['coversFrom', (s) => s.coversFrom],
        ['coversThrough', (s) => s.coversThrough],
        ['issued', (s) => s.issuedAt],
        ['hub', (s) => s.hubId],
        ['oreForm', (s) => s.oreForm],
        ['lines', (s) => s.lines.length],
        ['amount', (s) => s.amount],
        ['settled', (s) => (input.paidStatementIds.has(s.id) ? yes : no)],
      ]
    ),
    sheet(
      t,
      'payments',
      [...input.payments].sort(
        byKey(
          (p) => p.at,
          (p) => p.id
        )
      ),
      [
        ['paymentId', (p) => p.id],
        ['time', (p) => p.at],
        ['character', (p) => names.character(p.characterId)],
        ['characterId', (p) => p.characterId],
        ['miner', (p) => minerName(p.minerId ?? minerOf(p.characterId))],
        ['minerId', (p) => p.minerId ?? minerOf(p.characterId)],
        ['amount', (p) => p.amount],
        ['notTax', (p) => p.notTaxAmount],
        ['source', (p) => t(`corpTaxBook.export.paymentSource.${p.source}`)],
        ['statementId', (p) => p.statementId],
      ]
    ),
    sheet(
      t,
      'adjustments',
      [...input.adjustments].sort(
        byKey(
          (a) => a.at,
          (a) => a.id
        )
      ),
      [
        ['adjustmentId', (a) => a.id],
        ['miner', (a) => minerName(a.minerId)],
        ['minerId', (a) => a.minerId],
        ['date', (a) => a.date],
        ['amount', (a) => a.amount],
        ['reason', (a) => a.reason],
        ['by', (a) => character(a.by)],
        ['byId', (a) => a.by],
        ['time', (a) => a.at],
      ]
    ),
    sheet(
      t,
      'writeOffs',
      [...input.writeOffs].sort(
        byKey(
          (w) => w.at,
          (w) => w.id
        )
      ),
      [
        ['writeOffId', (w) => w.id],
        ['miner', (w) => minerName(w.minerId)],
        ['minerId', (w) => w.minerId],
        ['amount', (w) => w.amount],
        ['reason', (w) => w.reason],
        ['statementId', (w) => w.statementId],
        ['time', (w) => w.at],
      ]
    ),
    sheet(
      t,
      'dismissals',
      [...input.dismissals].sort(
        byKey(
          (d) => d.at,
          (d) => d.id
        )
      ),
      [
        ['dismissalId', (d) => d.id],
        ['scope', (d) => t(`corpTaxBook.export.dismissalScope.${d.scope}`)],
        ['target', (d) => d.targetId],
        ['reason', (d) => d.reason],
        ['by', (d) => character(d.by)],
        ['byId', (d) => d.by],
        ['time', (d) => d.at],
        ['reversedBy', (d) => character(d.reversed?.by)],
        ['reversedAt', (d) => d.reversed?.at],
      ]
    ),
    sheet(
      t,
      'miners',
      [...input.miners].sort(byKey((m) => names.character(m.mainCharacterId).toLowerCase())),
      [
        ['minerId', (m) => m.id],
        ['mainCharacter', (m) => names.character(m.mainCharacterId)],
        ['mainCharacterId', (m) => m.mainCharacterId],
        ['characters', (m) => joined(m.characterIds.map(names.character))],
        ['characterIds', (m) => joined(m.characterIds)],
        ['closed', (m) => m.closedAt],
        ['finalStatementId', (m) => m.finalStatementId],
      ]
    ),
    sheet(t, 'settings', settingsRows(input.settings, names, t), [
      ['setting', ([label]) => label],
      ['value', ([, value]) => value],
    ]),
    sheet(
      t,
      'activity',
      [...input.audit].sort(
        byKey(
          (e) => e.at,
          (e) => e.id
        )
      ),
      [
        ['time', (e) => isoTime(e.at)],
        ['by', (e) => e.byName],
        ['byId', (e) => e.by],
        ['via', (e) => e.via],
        ['action', (e) => e.action],
        ['detail', (e) => (Object.keys(e.detail ?? {}).length ? JSON.stringify(e.detail) : null)],
      ]
    ),
  ];
}
