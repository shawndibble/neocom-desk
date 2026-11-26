import { median } from './math';
import type { BpcContractRow } from './contracts/bpcSearch';

export interface OwnedBlueprintCopyAsset {
  itemId: number;
  typeId: number;
  me?: number;
  te?: number;
  runs?: number;
}

interface CopyRate {
  typeId: number;
  me: number;
  te: number;
  mixed: boolean;
  iskPerRun: number;
  iskPerCopy: number;
}

function tierKey(typeId: number, me: number, te: number): string {
  return `${typeId}:${me}:${te}`;
}

function contractRates(offers: readonly BpcContractRow[]): CopyRate[] {
  const byContract = new Map<number, BpcContractRow[]>();
  for (const row of offers) {
    if (row.isAuction || row.requestedPlex || row.isMultiType || !(row.price > 0)) continue;
    const list = byContract.get(row.contractId) ?? [];
    list.push(row);
    byContract.set(row.contractId, list);
  }

  const rates: CopyRate[] = [];
  for (const rows of byContract.values()) {
    const [first] = rows;
    if (!first) continue;
    const copiesOfOneBlueprint = rows.every(
      (r) => r.runs > 0 && r.quantity > 0 && r.typeId === first.typeId
    );
    if (!copiesOfOneBlueprint) continue;
    let copies = 0;
    let runs = 0;
    for (const r of rows) {
      copies += r.quantity;
      runs += r.quantity * r.runs;
    }
    rates.push({
      typeId: first.typeId,
      me: first.me,
      te: first.te,
      mixed: rows.some((r) => r.me !== first.me || r.te !== first.te),
      iskPerRun: first.price / runs,
      iskPerCopy: first.price / copies,
    });
  }
  return rates;
}

export function blueprintCopyValues(
  copies: readonly OwnedBlueprintCopyAsset[],
  offers: readonly BpcContractRow[]
): Map<number, number> {
  const ratesByTier = new Map<string, CopyRate[]>();
  const mixedRatesByType = new Map<number, CopyRate[]>();
  const push = <K>(map: Map<K, CopyRate[]>, key: K, rate: CopyRate) => {
    const list = map.get(key) ?? [];
    list.push(rate);
    map.set(key, list);
  };
  for (const rate of contractRates(offers)) {
    if (rate.mixed) push(mixedRatesByType, rate.typeId, rate);
    else push(ratesByTier, tierKey(rate.typeId, rate.me, rate.te), rate);
  }

  const values = new Map<number, number>();
  for (const owned of copies) {
    const known = owned.me !== undefined && owned.te !== undefined;
    const rates =
      (known ? ratesByTier.get(tierKey(owned.typeId, owned.me!, owned.te!)) : undefined) ??
      ratesByTier.get(tierKey(owned.typeId, 0, 0)) ??
      mixedRatesByType.get(owned.typeId);
    if (!rates) {
      values.set(owned.itemId, 0);
      continue;
    }
    const value =
      owned.runs !== undefined && owned.runs > 0
        ? median(rates.map((r) => r.iskPerRun)) * owned.runs
        : median(rates.map((r) => r.iskPerCopy));
    values.set(owned.itemId, value);
  }
  return values;
}
