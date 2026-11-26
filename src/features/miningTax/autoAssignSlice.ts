import { db, type MiningTaxAssignmentRecord, type MiningTaxOreLine, type PayeeRecord } from '@/db';
import { isUnpaidDefault } from '@/engine/miningTax/defaultSystems';
import type { Takeover } from '@/engine/miningTax/surveyConnection';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { assign, releaseOre, type LedgerActionResult } from './ledgerActions';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';
import { hubForPayee, loadUnitPricesOnDate } from './pricing';

export interface AutoAssignSliceInput {
  characterId: number;
  date: string;
  solarSystemId: number;
  payee: PayeeRecord;
  oreLines: MiningTaxOreLine[];
  entryOreLines: readonly MiningTaxOreLine[];
  taxPct: number;
  compressed: boolean;
  label?: string;
  byDefault?: boolean;
  takeOver?: { takeovers: readonly Takeover[]; paid: PayeeRunningAccounts };
}

export async function autoAssignSlice(
  input: AutoAssignSliceInput
): Promise<LedgerActionResult<MiningTaxAssignmentRecord> | undefined> {
  const { prices } = await loadUnitPricesOnDate(
    input.oreLines.map((line) => line.typeId),
    hubForPayee(input.payee.hubId),
    input.date,
    input.compressed
  );
  const value = computeAssignmentValue(input.oreLines, prices, input.taxPct);
  const { takeOver } = input;
  if (takeOver && !(await takeOverFromDefaults(takeOver.takeovers, takeOver.paid)))
    return undefined;
  return assign({
    characterId: input.characterId,
    date: input.date,
    solarSystemId: input.solarSystemId,
    payeeId: input.payee.id,
    oreLines: input.oreLines,
    entryOreLines: input.entryOreLines,
    taxPct: input.taxPct,
    estimatedValue: value.estimatedValue,
    taxOwed: value.taxOwed,
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.byDefault ? { byDefault: true } : {}),
    ...(takeOver ? { takesGrowth: true, isPaid: (a) => takeOver.paid.isPaid(a) } : {}),
  });
}

async function takeOverFromDefaults(
  takeovers: readonly Takeover[],
  paid: PayeeRunningAccounts
): Promise<boolean> {
  const releases: { assignment: MiningTaxAssignmentRecord; after: MiningTaxOreLine[] }[] = [];
  for (const takeover of takeovers) {
    const assignment = await db.miningTaxAssignments.get(takeover.assignmentId);
    if (!assignment || !isUnpaidDefault(paid.view(assignment))) {
      continue;
    }
    releases.push({
      assignment,
      after: assignment.oreLines.filter((l) => !takeover.typeIds.includes(l.typeId)),
    });
  }
  if (releases.length === 0) return true;
  return (await releaseOre(releases, true)).ok;
}
