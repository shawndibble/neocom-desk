/**
 * Links the Payees made before a Payee had to be someone in EVE (or synced in
 * from a device that still allowed it): a Payee whose name is exactly one
 * corporation or character is linked to it (`rememberPayeeEntity`, which syncs),
 * so a Corp Tax Book can tell its corporation's Payee from a stranger's.
 * Best effort and quiet: one `/universe/ids` call for every unlinked name, each
 * Payee asked about once a session, a failed lookup left for the next session.
 * What still can't be linked is the pilot's to fix in Manage Payees.
 */
import { useEffect, useRef, useState } from 'react';
import { db, type PayeeRecord } from '@/db';
import { lookupPayeeNames, payeeNameKey } from './payeeLookup';
import { rememberPayeeEntity } from './payees';

/** Payees asked about this session, whether or not ESI answered. */
const attempted = new Set<string>();
/** Payees whose check has finished. */
const settled = new Set<string>();
/** Payees this session linked, until the caller's list catches up. */
const linkedHere = new Set<string>();

export function resetPayeeAutoLinkForTests(): void {
  attempted.clear();
  settled.clear();
  linkedHere.clear();
}

/** Has no EVE entity: neither picked, looked up nor learned from a payment. */
export function isUnlinkedPayee(payee: PayeeRecord): boolean {
  return payee.entityId === undefined;
}

/**
 * Links each unlinked Payee not yet asked about whose name is one corporation or
 * character. Returns the Payees it linked, or null when there was nobody to ask about.
 */
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
      if (lookup?.status !== 'found') continue;
      // Re-read: the list may be older than an edit made while ESI answered.
      const fresh = await db.payees.get(p.id);
      if (!fresh || !isUnlinkedPayee(fresh) || payeeNameKey(fresh.name) !== payeeNameKey(p.name)) {
        continue;
      }
      linked.push(await rememberPayeeEntity(fresh, lookup.match.id, lookup.match.kind));
      linkedHere.add(p.id);
    }
  } catch {
    // Offline or ESI erred: left unlinked, and not asked again this session.
  } finally {
    for (const p of due) settled.add(p.id);
  }
  return linked;
}

/**
 * Runs `linkUnlinkedPayees` over `payees` without blocking the page; `onLinked`
 * reloads them once any was linked. Returns the Payees still unlinked after
 * their check, so nothing is reported before the lookup has answered.
 */
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
