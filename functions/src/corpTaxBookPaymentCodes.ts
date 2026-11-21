// The Reason codes the scheduled sync recognises on a donation (decision 20261120-235011): each
// Miner's own code, and every code a Late notice already printed. A code only says whose money a
// donation is; the money still pays that Miner's oldest unpaid day, so no notice is pinned to it.
//
// The codes are handed to the sync engine's `matchDonation` (a mirror of the client's) as the
// `{ id, minerId, code }` entries it matches a reason against.

import { minerPaymentCode, type LateNotice } from './corpTaxBookLateNotice.js';
import type { JournalDonation, StatementLike } from './corpTaxBookSyncEngine.js';

/** Every code a donation may carry: each notice's printed code, then each Miner's own, once each. */
export function recognisedCodes(
  notices: readonly Pick<LateNotice, 'id' | 'minerId' | 'code'>[],
  minerIds: Iterable<string>
): StatementLike[] {
  const byCode = new Map<string, StatementLike>();
  const add = (id: string, minerId: string, code: string) => {
    if (!byCode.has(code)) byCode.set(code, { id, minerId, code });
  };
  for (const n of notices) if (n.code) add(n.id, n.minerId, n.code);
  for (const minerId of [...notices.map((n) => n.minerId), ...minerIds])
    add('', minerId, minerPaymentCode(minerId));
  return [...byCode.values()];
}

/** A matched donation without the notice its code came from: the code named only the Miner. */
export function withoutNotice(d: JournalDonation): JournalDonation {
  const { statementId: _notice, ...rest } = d;
  void _notice;
  return rest;
}
