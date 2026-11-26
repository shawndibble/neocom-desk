import { db, type MiningTaxAssignmentRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { diffAssignedOreLines } from '@/engine/miningTax/needsReview';
import { computeOwnership, type Ownership } from '@/engine/miningTax/ownership';
import { planNeedsReviewResolution } from './assignments';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';
import { loadPayeeRunningAccounts } from './paymentLinkStore';
import type { MiningLedgerEntry, QuantityDiff } from '@/engine/miningTax/types';
import { putAssignments } from './storedAssignments';

function sameDiffs(a: readonly QuantityDiff[] | undefined, b: readonly QuantityDiff[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every(
    (d, i) => d.typeId === b[i].typeId && d.before === b[i].before && d.after === b[i].after
  );
}

export async function reconcileAssignments(
  characterId: number,
  freshEntries: readonly MiningLedgerEntry[],
  accounts?: PayeeRunningAccounts
): Promise<void> {
  const stored = await db.miningTaxAssignments.where('characterId').equals(characterId).toArray();
  if (stored.length === 0) return;
  const paid = accounts ?? (await loadPayeeRunningAccounts());
  const assignments = stored.map((a) => paid.view(a));
  const storedById = new Map(stored.map((a) => [a.id, a]));

  const freshByKey = new Map(
    freshEntries.map((entry) => [`${entry.date}:${entry.solarSystemId}`, entry])
  );
  const siblingsByKey = new Map<string, MiningTaxAssignmentRecord[]>();
  for (const a of assignments) {
    const key = `${a.date}:${a.solarSystemId}`;
    let siblings = siblingsByKey.get(key);
    if (!siblings) siblingsByKey.set(key, (siblings = []));
    siblings.push(a);
  }
  const ownershipByKey = new Map<string, Ownership>();
  for (const [key, siblings] of siblingsByKey) {
    const entry = freshByKey.get(key);
    if (entry) ownershipByKey.set(key, computeOwnership(entry.oreLines, siblings));
  }
  const now = Date.now();
  const updates: MiningTaxAssignmentRecord[] = [];
  const absorbs: { assignment: MiningTaxAssignmentRecord; key: string }[] = [];

  for (const assignment of assignments) {
    const key = `${assignment.date}:${assignment.solarSystemId}`;
    const relevantFresh = ownershipByKey.get(key)?.ownedLines.get(assignment.id);
    if (!relevantFresh) continue;
    const diffs = diffAssignedOreLines(assignment.oreLines, relevantFresh);
    if (diffs.length === 0) continue;
    if (assignment.status === 'needs-review' && sameDiffs(assignment.reviewDiff, diffs)) continue;
    const soleOnItsDay = siblingsByKey.get(key)!.length === 1;
    if (assignment.status === 'outstanding' && soleOnItsDay) {
      absorbs.push({ assignment, key });
      continue;
    }
    updates.push({
      ...storedById.get(assignment.id)!,
      status: 'needs-review',
      reviewDiff: diffs,
      updatedAt: now,
    });
  }

  for (const { assignment, key } of absorbs) {
    const record = storedById.get(assignment.id)!;
    try {
      updates.push(
        await planNeedsReviewResolution(record, freshByKey.get(key)!, siblingsByKey.get(key)!)
      );
    } catch {
      const diffs = diffAssignedOreLines(
        assignment.oreLines,
        ownershipByKey.get(key)!.ownedLines.get(assignment.id)!
      );
      updates.push({ ...record, status: 'needs-review', reviewDiff: diffs, updatedAt: now });
    }
  }

  if (updates.length > 0) {
    await putAssignments(updates);
    scheduleSync(characterId, { collections: ['miningTaxAssignments'] });
  }
}
