/**
 * A corporation's SRP as one workbook (#4946): Settings, every SRP Claim (all states), the SRP
 * log and the Doctrine Fits, a sheet each. Pure: the caller reads them and hands the sheets to
 * `downloadWorkbook`.
 */
import type { CsvTranslate } from '@/lib/csv';
import {
  isoTime,
  joined,
  jsonOrNull,
  settingsSheet,
  sheetFrom,
  type SettingRow,
  type SheetColumns,
} from '@/lib/exportSheets';
import type { AnyXlsxSheet } from '@/lib/xlsx';
import type { SrpAuditEntry, SrpClaim } from '../srpClaimTypes';
import type { DoctrineFit, HullRule, SrpClaimBasis, SrpSettings } from '../srpTypes';

export interface SrpExportInput {
  /** Null when SRP was never turned on. */
  settings: SrpSettings | null;
  claims: readonly SrpClaim[];
  audit: readonly SrpAuditEntry[];
  doctrines: readonly DoctrineFit[];
}

export interface SrpExportNames {
  /** Any type: a hull, a module, a rig. */
  type: (typeId: number) => string;
  system: (systemId: number) => string;
  /** A log entry as the officer feed words it. */
  describe: (entry: SrpAuditEntry) => string;
}

const PREFIX = 'srp.export';

const sheet = <T>(t: CsvTranslate, name: string, rows: readonly T[], columns: SheetColumns<T>) =>
  sheetFrom(t, PREFIX, name, rows, columns);

/** `2x Name; 1x Name`, in the order each type first appears. */
function counted(typeIds: readonly number[], names: SrpExportNames): string {
  const counts = new Map<number, number>();
  for (const id of typeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return joined([...counts].map(([id, n]) => `${n}x ${names.type(id)}`));
}

function basisText(basis: SrpClaimBasis | null, t: CsvTranslate): string | null {
  if (!basis) return null;
  return t(`srp.export.basis.${basis.step}`, 'percent' in basis ? { percent: basis.percent } : {});
}

function settingsRows(
  s: SrpSettings | null,
  doctrines: readonly DoctrineFit[],
  names: SrpExportNames,
  t: CsvTranslate
): SettingRow[] {
  if (!s) return [[t('srp.export.setting.enabled'), t('srp.export.never')]];
  const yes = t('srp.export.yes');
  const no = t('srp.export.no');
  const label = (key: string, options?: Record<string, unknown>) =>
    t(`srp.export.setting.${key}`, options);
  const fitName = new Map(doctrines.map((d) => [d.id, d.name]));
  const ruleRows = (rule: HullRule): SettingRow[] => {
    const target = t(`srp.export.ruleTarget.${rule.scope}`, {
      name: rule.scope === 'hull' ? names.type(rule.id) : String(rule.id),
      id: rule.id,
    });
    const rows: SettingRow[] = [
      [
        label('hullRule', { target }),
        t(`srp.export.rule.${rule.kind}`, rule.kind === 'pay-fixed' ? { isk: rule.iskAmount } : {}),
      ],
    ];
    if (rule.doctrineIds?.length) {
      rows.push([
        label('hullRuleDoctrines', { target }),
        joined(rule.doctrineIds.map((id) => fitName.get(id) ?? id)),
      ]);
    }
    return rows;
  };
  return [
    [label('enabled'), s.enabled ? yes : no],
    [label('killmailPct'), s.killmailPct],
    [label('appraisalPct'), s.appraisalPct],
    [label('windowDays'), s.windowDays],
    [label('requireFleetOrFc'), s.requireFleetOrFc ? yes : no],
    [label('ownerId'), s.ownerCharacterId],
    [label('createdById'), s.createdBy],
    [label('createdAt'), isoTime(s.createdAt)],
    [label('updatedById'), s.updatedBy],
    [label('updatedAt'), isoTime(s.updatedAt)],
    ...s.hullRules.flatMap(ruleRows),
  ];
}

const numberOf = (value: unknown): number | null => (typeof value === 'number' ? value : null);

export function srpExportSheets(
  input: SrpExportInput,
  names: SrpExportNames,
  t: CsvTranslate
): AnyXlsxSheet[] {
  return [
    settingsSheet(t, PREFIX, settingsRows(input.settings, input.doctrines, names, t)),
    sheet(
      t,
      'claims',
      [...input.claims].sort((a, b) => a.filedAt - b.filedAt || a.killmailId - b.killmailId),
      [
        ['killmailId', (c) => c.killmailId],
        ['state', (c) => t(`srp.export.state.${c.state}`)],
        ['pilot', (c) => c.characterName],
        ['pilotId', (c) => c.characterId],
        ['hull', (c) => names.type(c.hullTypeId)],
        ['hullId', (c) => c.hullTypeId],
        ['system', (c) => names.system(c.solarSystemId)],
        ['systemId', (c) => c.solarSystemId],
        ['killed', (c) => isoTime(c.killedAt)],
        ['filed', (c) => isoTime(c.filedAt)],
        ['amount', (c) => c.amount],
        ['basis', (c) => basisText(c.basis, t)],
        ['computedAmount', (c) => c.computedAmount],
        ['suggested', (c) => c.suggested?.isk],
        ['fleetOrFc', (c) => c.fleetOrFc],
        ['note', (c) => c.note],
        ['refiled', (c) => c.refileCount],
        [
          'doctrineCheck',
          (c) => t(`srp.export.doctrine.${c.doctrineCheck?.status ?? 'not-checked'}`),
        ],
        ['doctrineFit', (c) => c.doctrineCheck?.doctrineName],
        ['overrideReason', (c) => c.overrideReason],
        ['overrideBy', (c) => c.overrideByName],
        ['decided', (c) => isoTime(c.decidedAt)],
        ['decidedBy', (c) => c.decidedByName],
        ['rejectionReason', (c) => c.rejectionReason ?? c.previousRejectionReason],
        ['paid', (c) => isoTime(c.paidAt)],
        ['paidBy', (c) => c.paidByName],
        ['closed', (c) => isoTime(c.closedAt)],
      ]
    ),
    sheet(
      t,
      'log',
      [...input.audit].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)),
      [
        ['time', (e) => isoTime(e.at)],
        ['by', (e) => e.byName],
        ['byId', (e) => e.by],
        ['action', (e) => e.action],
        ['summary', (e) => names.describe(e)],
        ['killmailId', (e) => numberOf(e.detail?.killmailId)],
        ['detail', (e) => jsonOrNull(e.detail)],
      ]
    ),
    sheet(
      t,
      'doctrines',
      [...input.doctrines].sort((a, b) => a.createdAt - b.createdAt),
      [
        ['doctrineId', (d) => d.id],
        ['name', (d) => d.name],
        ['hull', (d) => names.type(d.snapshot.hullTypeId)],
        ['hullId', (d) => d.snapshot.hullTypeId],
        ['modules', (d) => counted(d.snapshot.modules, names)],
        ['rigs', (d) => counted(d.snapshot.rigs, names)],
        ['createdById', (d) => d.createdBy],
        ['created', (d) => isoTime(d.createdAt)],
      ]
    ),
  ];
}
