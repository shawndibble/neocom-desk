import { useEffect, useRef, useState } from 'react';
import { db, type PayeeRecord } from '@/db';
import { lookupPayeeNames, payeeNameKey } from './payeeLookup';
import { rememberPayeeEntity } from './payees';

const attempted = new Set<string>();
const settled = new Set<string>();
const linkedHere = new Set<string>();

export function resetPayeeAutoLinkForTests(): void {
  attempted.clear();
  settled.clear();
  linkedHere.clear();
}

export function isUnlinkedPayee(payee: PayeeRecord): boolean {
  return payee.entityId === undefined;
}

export async function linkUnlinkedPayees(
  payees: readonly PayeeRecord[]
): Promise<PayeeRecord[] | null> {
  const due = payees.filter((p) => isUnlinkedPayee(p) && !attempted.has(p.id));
  if (due.length === 0) return null;
  for (const p of due) attempted.add(p.id);
  const linked: PayeeRecord[] = [];
  try {
    const lookups = await lookupPayeeNames(due.map((p) => p.name));
    for (const p of due) {
      const lookup = lookups.get(payeeNameKey(p.name));
      if (lookup?.status !== 'found' || lookup.match.kind !== 'corporation') continue;
      const matchId = lookup.match.id;
      if (payees.some((o) => o.characterId === p.characterId && o.entityId === matchId)) continue;
      const fresh = await db.payees.get(p.id);
      if (!fresh || !isUnlinkedPayee(fresh) || payeeNameKey(fresh.name) !== payeeNameKey(p.name)) {
        continue;
      }
      linked.push(await rememberPayeeEntity(fresh, lookup.match.id));
      linkedHere.add(p.id);
    }
    for (const p of due) settled.add(p.id);
  } catch {}
  return linked;
}

export function useAutoLinkPayees(
  payees: readonly PayeeRecord[],
  onLinked: () => void
): PayeeRecord[] {
  const [, setChecked] = useState(0);
  const onLinkedRef = useRef(onLinked);
  useEffect(() => {
    onLinkedRef.current = onLinked;
  }, [onLinked]);
  useEffect(() => {
    void linkUnlinkedPayees(payees).then((linked) => {
      if (linked === null) return;
      setChecked((n) => n + 1);
      if (linked.length > 0) onLinkedRef.current();
    });
  }, [payees]);
  return payees.filter((p) => isUnlinkedPayee(p) && settled.has(p.id) && !linkedHere.has(p.id));
}
