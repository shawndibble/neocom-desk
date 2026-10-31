/**
 * The Corp Tax Book as one workbook (#4946, #4959): a sheet per record type, every record the
 * officer can read, names beside ids so the file reads for a person and still joins for a script.
 * Left out on purpose: the Statement verify links (credentials, editors only), the moon owners'
 * own view (only they can read it) and the miners' coverage copy (the Moon owners sheet has it).
 * Pure: the caller reads the book and hands the sheets to `downloadWorkbook`.
 */
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { RecordedWriteOff } from '@/engine/corpTaxBook/allocation';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import { deriveModeChanges, deriveOwnerRateHistory } from '@/engine/corpTaxBook/feederAccrual';
import type { ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { Adjustment, Statement, StatementLine } from '@/engine/corpTaxBook/statements';
import type { SettlePayment, SyncExtraction } from '@/engine/corpTaxBook/sync';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import type { CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import {
  byKey,
  isoTime,
  joined,
  jsonOrNull,
  settingsSheet,
  sheetFrom,
  type SettingRow,
  type SheetColumns,
} from '@/lib/exportSheets';
import type { AnyXlsxSheet } from '@/lib/xlsx';
import { oreLinesText } from '../../miningTax/oreBreakdown';
import type {
  AuditEntry,
  BookDeclaration,
  BookFeeder,
  BookSettings,
  GroupingAnswer,
  Rebill,
} from '../taxBook/bookClient';
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
  declarations: readonly BookDeclaration[];
  rebills: readonly Rebill[];
  groupingAnswers: readonly GroupingAnswer[];
  /** Characters an officer unlinked, which automatic grouping leaves alone. */
  declinedAutoGroup: readonly number[];
  extractions: readonly SyncExtraction[];
  /** The moon owners (Feeders), each with its payouts. */
  feeders: readonly BookFeeder[];
  audit: readonly AuditEntry[];
  /** The Automatic sync's status; null when it was never turned on or was revoked. */
  scheduledSync?: ScheduledSyncStatus | null;
}

export type BookExportNames = Pick<
  BookNames,
  'character' | 'corporation' | 'refinery' | 'moon' | 'ore'
>;

type MinerName = (minerId: string | undefined) => string | null;

const PREFIX = 'corpTaxBook.export';
/** The Moon owners page's own payout labels, so the file and the page never disagree. */
const PAYOUT_LABELS = 'corpTaxBook.moons.moonOwners.page.payouts';

const sheet = <T>(t: CsvTranslate, name: string, rows: readonly T[], columns: SheetColumns<T>) =>
  sheetFrom(t, PREFIX, name, rows, columns);

function rateTarget(rate: TaxRate, names: BookExportNames, minerName: MinerName): string | null {
  switch (rate.scope) {
    case 'corp':
    case 'guest':
      return null;
    case 'feeder':
      return names.corporation(rate.feederId);
    case 'miner':
      return minerName(rate.minerId);
    case 'moon':
      return names.moon(rate.moonId);
    case 'structure':
      return names.refinery(rate.structureId);
    case 'record':
      return rate.recordKey;
  }
}

function settingsRows(
  input: BookExportInput,
  names: BookExportNames,
  minerName: MinerName,
  t: CsvTranslate
): SettingRow[] {
  const s = input.settings;
  const scheduled = input.scheduledSync ?? null;
  const label = (key: string, options?: Record<string, unknown>) =>
    t(`corpTaxBook.export.setting.${key}`, options);
  const cadence =
    s.cadence.kind === 'monthly'
      ? label('cadenceMonthly')
      : label('cadenceDays', { days: s.cadence.days, anchor: s.cadence.anchor });
  return [
    [label('active'), exportFlag(t, s.active)],
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
    [label('membersSeeFrom'), isoTime(s.membersSeeFrom)],
    [
      label('automaticSync'),
      scheduled
        ? label(`automaticSync${scheduled.status === 'active' ? 'On' : 'Stopped'}`, {
            name: scheduled.characterName,
          })
        : label('automaticSyncOff'),
    ],
    [label('declinedAutoGroup'), joined(input.declinedAutoGroup.map(names.character))],
    ...s.rates.map((rate): SettingRow => [
      label(`rate.${rate.scope}`, {
        target: rateTarget(rate, names, minerName),
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
): AnyXlsxSheet[] {
  const minerById = new Map(input.miners.map((m) => [m.id, m]));
  const minerIdOf = new Map(input.miners.flatMap((m) => m.characterIds.map((c) => [c, m.id])));
  /** A grouped Miner by its main character; a `solo:<id>` one by its only character. */
  const minerName: MinerName = (minerId) => {
    if (!minerId) return null;
    const miner = minerById.get(minerId);
    if (miner) return names.character(miner.mainCharacterId);
    const solo = /^solo:(\d+)$/.exec(minerId);
    return solo ? names.character(Number(solo[1])) : minerId;
  };
  const minerOf = (characterId: number) => minerIdOf.get(characterId) ?? `solo:${characterId}`;
  const character = (id: number | null | undefined) =>
    typeof id === 'number' ? names.character(id) : null;
  const statementLines = [...input.statements]
    .sort(
      byKey(
        (s) => s.issuedAt,
        (s) => s.id
      )
    )
    .flatMap((statement) =>
      statement.lines.map((line): { statement: Statement; line: StatementLine } => ({
        statement,
        line,
      }))
    );
  /** "Ore: value" for each ore of a Statement line that has one in `byType`. */
  const perOre = <V>(
    line: StatementLine,
    byType: Readonly<Record<number, V>> | undefined,
    format: (value: V) => string | number
  ) =>
    joined(
      line.oreLines.flatMap((ore) => {
        const value = byType?.[ore.typeId];
        return value === undefined ? [] : [`${names.ore(ore.typeId)}: ${format(value)}`];
      })
    );
  const statementMiner = new Map(input.statements.map((s) => [s.id, s.minerId]));
  const payouts = input.feeders.flatMap((f) =>
    f.payouts.map((payout) => ({ feeder: f.corporationId, payout }))
  );
  const ownerRates = input.feeders.flatMap((f) =>
    deriveOwnerRateHistory(f).map((entry) => ({ feeder: f.corporationId, entry }))
  );
  const payee = (f: BookFeeder) =>
    !f.payee
      ? null
      : f.payee.kind === 'corporation'
        ? names.corporation(f.payee.id)
        : names.character(f.payee.id);

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
        ['settled', (s) => exportFlag(t, input.paidStatementIds.has(s.id))],
        ['mailsSent', (s) => s.mailsSent],
        ['lastMailed', (s) => s.lastMailedAt],
        ['issuedBy', (s) => character(s.issuedBy)],
        ['issuedById', (s) => s.issuedBy],
        ['remindersStopped', (s) => exportFlag(t, s.remindersStopped)],
        ['manualReminders', (s) => s.manualRemindersSent],
        ['storedMinerName', (s) => s.minerName],
      ]
    ),
    // Every line of every Statement: the Statements sheet only counts them.
    sheet(t, 'statementLines', statementLines, [
      ['statementId', (l) => l.statement.id],
      ['miner', (l) => minerName(l.statement.minerId)],
      ['minerId', (l) => l.statement.minerId],
      ['date', (l) => l.line.date],
      ['character', (l) => character(l.line.characterId)],
      ['characterId', (l) => l.line.characterId],
      [
        'refinery',
        (l) => (l.line.structureId === undefined ? null : names.refinery(l.line.structureId)),
      ],
      ['refineryId', (l) => l.line.structureId],
      ['ore', (l) => oreLinesText(l.line.oreLines, names.ore)],
      ['unitPrices', (l) => perOre(l.line, l.line.unitPrices, (price) => price)],
      [
        'priceSources',
        (l) =>
          perOre(l.line, l.line.priceSources, (source) =>
            t(`corpTaxBook.export.priceSource.${source}`)
          ),
      ],
      ['taxPct', (l) => l.line.taxPct],
      ['rateEffectiveFrom', (l) => l.line.rateEffectiveFrom],
      ['estimatedValue', (l) => l.line.estimatedValue],
      ['tax', (l) => l.line.tax],
      ['reason', (l) => l.line.reason],
      ['kind', (l) => t(`corpTaxBook.export.lineKind.${l.line.kind}`)],
      ['adjustmentId', (l) => l.line.adjustmentId],
    ]),
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
      'declarations',
      [...input.declarations].sort(
        byKey(
          (d) => d.at,
          (d) => d.id
        )
      ),
      [
        ['declarationId', (d) => d.id],
        ['statementId', (d) => d.statementId],
        ['miner', (d) => minerName(statementMiner.get(d.statementId))],
        ['minerId', (d) => statementMiner.get(d.statementId)],
        ['kind', (d) => t(`corpTaxBook.export.declarationKind.${d.kind}`)],
        ['time', (d) => d.at],
        ['note', (d) => d.note],
        ['recordedBy', (d) => character(d.recordedBy)],
        ['recordedById', (d) => d.recordedBy],
        [
          'resolution',
          (d) => (d.resolution ? t(`corpTaxBook.export.resolution.${d.resolution.kind}`) : null),
        ],
        ['resolvedAt', (d) => d.resolution?.at],
        ['resolvedBy', (d) => character(d.resolution?.by)],
        ['resolvedById', (d) => d.resolution?.by],
        ['resolutionReason', (d) => d.resolution?.reason],
      ]
    ),
    sheet(
      t,
      'rebills',
      [...input.rebills].sort(
        byKey(
          (r) => r.at,
          (r) => r.id
        )
      ),
      [
        ['rebillId', (r) => r.id],
        ['miner', (r) => minerName(r.minerId)],
        ['minerId', (r) => r.minerId],
        ['fromDate', (r) => r.fromDate],
        ['reason', (r) => r.reason],
        ['memberRebill', (r) => exportFlag(t, r.memberRebill)],
        ['by', (r) => character(r.by)],
        ['byId', (r) => r.by],
        ['time', (r) => r.at],
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
    sheet(
      t,
      'groupingAnswers',
      [...input.groupingAnswers].sort(
        byKey(
          (a) => a.at,
          (a) => a.characterId
        )
      ),
      [
        ['character', (a) => names.character(a.characterId)],
        ['characterId', (a) => a.characterId],
        ['miner', (a) => minerName(a.minerId)],
        ['minerId', (a) => a.minerId],
        ['answer', (a) => t(`corpTaxBook.export.groupingAnswer.${a.answer}`)],
        ['via', (a) => t(`corpTaxBook.export.answerVia.${a.via}`)],
        ['time', (a) => a.at],
      ]
    ),
    sheet(
      t,
      'extractions',
      [...input.extractions].sort(
        byKey(
          (x) => x.extractionStartTime,
          (x) => x.structureId
        )
      ),
      [
        ['refinery', (x) => names.refinery(x.structureId)],
        ['refineryId', (x) => x.structureId],
        ['moon', (x) => names.moon(x.moonId)],
        ['moonId', (x) => x.moonId],
        ['started', (x) => x.extractionStartTime],
        ['chunkArrival', (x) => x.chunkArrivalTime],
        ['naturalDecay', (x) => x.naturalDecayTime],
        ['laserFired', (x) => x.laserFiredAt],
        ['cancelled', (x) => x.cancelledAt],
        ['ore', (x) => oreLinesText(x.oreLines ?? [], names.ore)],
        ['surveyId', (x) => x.surveyId],
      ]
    ),
    sheet(
      t,
      'moonOwners',
      [...input.feeders].sort(byKey((f) => names.corporation(f.corporationId).toLowerCase())),
      [
        ['moonOwner', (f) => names.corporation(f.corporationId)],
        ['moonOwnerId', (f) => f.corporationId],
        ['status', (f) => t(`corpTaxBook.export.moonOwnerStatus.${f.status}`)],
        ['mode', (f) => t(`corpTaxBook.export.moonOwnerMode.${f.mode}`)],
        [
          'modeChanges',
          (f) =>
            joined(
              deriveModeChanges(f).map(
                (c) => `${c.from}: ${t(`corpTaxBook.export.moonOwnerMode.${c.mode}`)}`
              )
            ),
        ],
        ['joined', (f) => isoTime(f.joinedAt)],
        ['left', (f) => isoTime(f.leftAt)],
        ['invitedBy', (f) => names.character(f.invitedBy)],
        ['invitedById', (f) => f.invitedBy],
        ['payee', payee],
        ['payeeId', (f) => f.payee?.id],
        ['requestedRate', (f) => f.requestedRatePct],
        ['agreedRate', (f) => f.agreedRatePct],
        ['offeredRate', (f) => f.offeredOwnerRatePct],
        [
          'coverage',
          (f) => joined(f.coveragePeriods.map((p) => `${p.from} – ${p.to ?? ''}`.trimEnd())),
        ],
        ['lastReadWell', (f) => f.lastReadWellAt],
        ['staleSince', (f) => isoTime(f.staleSince)],
        ['disconnected', (f) => isoTime(f.disconnectedAt)],
        ['removalStarted', (f) => isoTime(f.removal?.startedAt)],
        ['removalStartedBy', (f) => f.removal?.startedByName],
        ['removalEffective', (f) => isoTime(f.removal?.effectiveAt)],
        ['note', (f) => f.note],
      ]
    ),
    sheet(
      t,
      'moonOwnerPayments',
      [...payouts].sort(
        byKey(
          (p) => p.payout.date,
          (p) => p.payout.id
        )
      ),
      [
        ['paymentId', (p) => p.payout.id],
        ['moonOwner', (p) => names.corporation(p.feeder)],
        ['moonOwnerId', (p) => p.feeder],
        ['date', (p) => p.payout.date],
        ['amount', (p) => p.payout.amount],
        ['method', (p) => t(`${PAYOUT_LABELS}.method.${p.payout.method}`)],
        ['status', (p) => t(`${PAYOUT_LABELS}.state.${p.payout.status}`)],
        ['journalRef', (p) => p.payout.journalRef],
        ['notAPayout', (p) => exportFlag(t, p.payout.notAPayout)],
      ]
    ),
    sheet(
      t,
      'moonOwnerRates',
      [...ownerRates].sort(
        byKey(
          (r) => r.entry.effectiveFrom,
          (r) => r.entry.recordedAt,
          (r) => r.feeder
        )
      ),
      [
        ['moonOwner', (r) => names.corporation(r.feeder)],
        ['moonOwnerId', (r) => r.feeder],
        ['kind', (r) => t(`corpTaxBook.export.rateKind.${r.entry.kind}`)],
        ['ratePct', (r) => r.entry.pct],
        ['effectiveFrom', (r) => r.entry.effectiveFrom],
        ['time', (r) => r.entry.recordedAt],
      ]
    ),
    settingsSheet(t, PREFIX, settingsRows(input, names, minerName, t)),
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
        ['detail', (e) => jsonOrNull(e.detail)],
      ]
    ),
  ];
}
