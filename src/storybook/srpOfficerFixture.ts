import type {
  SrpApproveItem,
  SrpAuditEntry,
  SrpBatchOutcome,
  SrpBatchResult,
  SrpClaim,
  SrpClaimOutcome,
  SrpMarkPaidItem,
} from '@/features/corp/srpClaimTypes';
import type { SrpOfficerBackendOverride } from '@/features/corp/srpOfficerBackendOverride';
import { SAMPLE_ACTIVE_CHARACTER } from './sampleData';

/** 23 Oct 2026, 14:00 EVE. */
export const OFFICER_NOW = Date.UTC(2026, 9, 23, 14);
const OFFICER = { id: SAMPLE_ACTIVE_CHARACTER.characterId, name: 'Kestrel Vane' };
const at = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour, minute);

const base = (killmailId: number, over: Partial<SrpClaim>): SrpClaim => ({
  killmailId,
  corporationId: SAMPLE_ACTIVE_CHARACTER.corporationId,
  characterId: 90000000 + killmailId,
  characterName: 'Pilot',
  hullTypeId: 17715,
  solarSystemId: 30002813,
  killedAt: at(22, 21, 14),
  filedAt: at(22, 22, 2),
  state: 'pending',
  amount: 250_000_000,
  basis: { step: 'hull-fixed' },
  suggested: null,
  fleetOrFc: null,
  note: null,
  refileCount: 0,
  ...over,
});

export type SrpOfficerScenario = 'queue' | 'empty';

function sampleClaims(): SrpClaim[] {
  return [
    // Off doctrine: a Gila with a gyrostabilizer pair where the doctrine has a damage control, and a rig short.
    base(131204551, {
      characterName: 'Varro Kestane',
      fleetOrFc: 'Roam, FC Dax Orlenn',
      doctrineCheck: {
        status: 'off-doctrine',
        doctrineId: 'd-gila',
        doctrineName: 'Gila - armour brawl',
        diff: {
          missingModules: [2048],
          extraModules: [519, 519],
          missingRigs: [31059],
          extraRigs: [],
        },
      },
    }),
    base(131207880, {
      characterName: 'Lysa Kestane',
      hullTypeId: 33157,
      solarSystemId: 30002537,
      killedAt: at(22, 23, 40),
      filedAt: at(23, 0, 15),
      amount: 65_975_000,
      basis: { step: 'killmail-percent', percent: 70 },
      doctrineCheck: {
        status: 'matched',
        doctrineId: 'd-hfi',
        doctrineName: 'Hurricane Fleet Issue - shield',
      },
    }),
    base(131212063, {
      characterName: 'Tamsin Vell',
      hullTypeId: 17736,
      solarSystemId: 30002718,
      killedAt: at(23, 8, 31),
      filedAt: at(23, 9, 10),
      fleetOrFc: 'Home defence, FC Mira Sol',
      amount: 367_440_000,
      basis: { step: 'appraisal-percent', percent: 60 },
      doctrineCheck: { status: 'not-checked' },
    }),
    base(131213902, {
      characterName: 'Orrin Tace',
      hullTypeId: 33818,
      solarSystemId: 30000157,
      killedAt: at(23, 10, 5),
      filedAt: at(23, 10, 48),
      amount: 80_000_000,
    }),
    base(131215447, {
      characterName: 'Bex Hallow',
      hullTypeId: 17843,
      solarSystemId: 30000141,
      killedAt: at(23, 11, 52),
      filedAt: at(23, 12, 30),
      amount: null,
      basis: null,
      suggested: { isk: 42_000_000, basis: { step: 'killmail-percent', percent: 70 } },
    }),
    base(131190338, {
      characterName: 'Dax Orlenn',
      state: 'approved',
      decidedAt: at(22, 9, 12),
      decidedBy: OFFICER.id,
      decidedByName: OFFICER.name,
    }),
    base(131196021, {
      characterName: 'Mira Sol',
      hullTypeId: 587,
      solarSystemId: 30003892,
      amount: 11_970_000,
      basis: { step: 'killmail-percent', percent: 70 },
      state: 'approved',
      decidedAt: at(22, 9, 13),
      decidedBy: OFFICER.id,
      decidedByName: OFFICER.name,
    }),
    base(131198774, {
      characterName: 'Joss Ferrin',
      hullTypeId: 12015,
      solarSystemId: 30002537,
      fleetOrFc: 'Home defence, FC Dax Orlenn',
      amount: 110_000_000,
      basis: { step: 'killmail-percent', percent: 70 },
      computedAmount: 140_000_000,
      amountSource: 'override',
      overrideReason: 'Fit had no faction modules; killmail value was inflated by cargo',
      overrideBy: OFFICER.id,
      overrideByName: OFFICER.name,
      overrideAt: at(22, 15, 29),
      state: 'approved',
      decidedAt: at(22, 15, 30),
      decidedBy: OFFICER.id,
      decidedByName: OFFICER.name,
    }),
    base(131171902, {
      characterName: 'Orrin Tace',
      hullTypeId: 587,
      solarSystemId: 30003892,
      amount: 9_800_000,
      basis: { step: 'killmail-percent', percent: 70 },
      state: 'paid',
      decidedAt: at(20, 8, 5),
      decidedBy: OFFICER.id,
      decidedByName: OFFICER.name,
      paidAt: at(20, 8, 11),
      paidBy: OFFICER.id,
      paidByName: OFFICER.name,
      closedAt: at(20, 8, 11),
    }),
    base(131180118, {
      characterName: 'Bex Hallow',
      hullTypeId: 593,
      solarSystemId: 30000141,
      amount: 1_900_000,
      basis: { step: 'appraisal-percent', percent: 60 },
      state: 'rejected',
      decidedAt: at(21, 10, 2),
      decidedBy: 91,
      decidedByName: 'Lena Maro',
      rejectionReason: 'Solo roam, not a corp fleet. SRP covers corp doctrine fleets only.',
      closedAt: at(21, 10, 2),
    }),
  ];
}

function sampleAudit(): SrpAuditEntry[] {
  const entry = (
    i: number,
    time: number,
    by: number,
    byName: string,
    action: string,
    detail: Record<string, unknown>
  ): SrpAuditEntry => ({ id: String(i).padStart(3, '0'), at: time, by, byName, action, detail });
  return [
    entry(1, at(22, 13, 1), 90000000 + 131198774, 'Joss Ferrin', 'fileClaim', {
      killmailId: 131198774,
      amount: 140_000_000,
    }),
    entry(2, at(22, 15, 30), OFFICER.id, OFFICER.name, 'approveClaim', {
      killmailId: 131198774,
      amount: 110_000_000,
      computedAmount: 140_000_000,
      reason: 'Fit had no faction modules; killmail value was inflated by cargo',
    }),
    entry(3, at(21, 10, 2), 91, 'Lena Maro', 'rejectClaim', {
      killmailId: 131180118,
      reason: 'Solo roam, not a corp fleet',
    }),
    entry(4, at(20, 8, 11), OFFICER.id, OFFICER.name, 'markClaimPaid', {
      killmailId: 131171902,
      amount: 9_800_000,
    }),
  ];
}

const refusal = (reason: string) => Object.assign(new Error(reason), { details: { reason } });

/** An in-memory officer queue for page stories; it applies the server's state rules. */
export function createSrpOfficerFixture(scenario: SrpOfficerScenario): SrpOfficerBackendOverride {
  let claims = scenario === 'queue' ? sampleClaims() : [];
  const audit = scenario === 'queue' ? sampleAudit() : [];
  let tick = OFFICER_NOW;

  const find = (id: number) => {
    const claim = claims.find((c) => c.killmailId === id);
    if (!claim) throw refusal('claim-not-found');
    return claim;
  };
  const record = (claim: SrpClaim, action: string, detail: Record<string, unknown>) => {
    tick += 1000;
    audit.push({
      id: String(audit.length + 1).padStart(3, '0'),
      at: tick,
      by: OFFICER.id,
      byName: OFFICER.name,
      action,
      detail: { killmailId: claim.killmailId, ...detail },
    });
  };
  const patch = (id: number, fields: Partial<SrpClaim>): SrpClaim => {
    const next = { ...find(id), ...fields };
    claims = claims.map((c) => (c.killmailId === id ? next : c));
    return next;
  };
  const outcome = (c: SrpClaim, reason?: string): SrpClaimOutcome => ({
    killmailId: c.killmailId,
    state: c.state,
    characterId: c.characterId,
    characterName: c.characterName,
    amount: c.amount,
    ...(reason === undefined ? {} : { reason }),
  });
  const requireState = (id: number, state: SrpClaim['state']) => {
    if (find(id).state !== state) throw refusal('illegal-transition');
  };
  const approve = (item: SrpApproveItem): SrpClaimOutcome => {
    requireState(item.killmailId, 'pending');
    const held = find(item.killmailId);
    if (item.expectedAmount !== undefined && item.expectedAmount !== held.amount) {
      throw refusal('amount-changed');
    }
    const amount = item.amount ?? held.amount;
    if (amount === null) throw refusal('amount-required');
    tick += 1000;
    const next = patch(item.killmailId, {
      state: 'approved',
      amount,
      decidedAt: tick,
      decidedBy: OFFICER.id,
      decidedByName: OFFICER.name,
    });
    record(next, 'approveClaim', { amount });
    return outcome(next);
  };
  const settle = (ids: number[], run: (id: number) => SrpClaimOutcome): SrpBatchOutcome => ({
    results: ids.map((id): SrpBatchResult => {
      try {
        return { ok: true, ...run(id) };
      } catch (e) {
        const reason = (e as { details?: { reason?: string } }).details?.reason ?? 'generic';
        return { ok: false, killmailId: id, reason, message: reason };
      }
    }),
  });
  const markPaid = ({ killmailId: id, expectedAmount }: SrpMarkPaidItem): SrpClaimOutcome => {
    requireState(id, 'approved');
    if (expectedAmount !== undefined && expectedAmount !== find(id).amount) {
      throw refusal('amount-changed');
    }
    tick += 1000;
    const next = patch(id, {
      state: 'paid',
      paidAt: tick,
      paidBy: OFFICER.id,
      paidByName: OFFICER.name,
      closedAt: tick,
    });
    record(next, 'markClaimPaid', { amount: next.amount });
    return outcome(next);
  };
  return {
    claims: () => claims.map((c) => ({ ...c })),
    activity: () => [...audit].sort((a, b) => b.at - a.at),
    claimValues: () => ({
      hullValue: 71_000_000,
      fitValue: 116_000_000,
      doctrineValue: 104_000_000,
      doctrineName: 'Hurricane - artillery',
    }),
    claimAudit: (id) => {
      const filed = find(id);
      const own = audit.filter((e) => e.detail.killmailId === id);
      return own.some((e) => e.action === 'fileClaim')
        ? own
        : [
            {
              id: `f${id}`,
              at: filed.filedAt,
              by: filed.characterId,
              byName: filed.characterName,
              action: 'fileClaim',
              detail: { killmailId: id, amount: filed.amount },
            },
            ...own,
          ];
    },
    approve,
    approveMany: (items) =>
      settle(
        items.map((i) => i.killmailId),
        (id) => approve(items.find((i) => i.killmailId === id)!)
      ),
    reject: (id, reason) => {
      requireState(id, 'pending');
      tick += 1000;
      const next = patch(id, {
        state: 'rejected',
        rejectionReason: reason,
        decidedAt: tick,
        decidedBy: OFFICER.id,
        decidedByName: OFFICER.name,
        closedAt: tick,
      });
      record(next, 'rejectClaim', { reason });
      return outcome(next, reason);
    },
    change: (id, amount, reason) => {
      if (find(id).state !== 'pending') requireState(id, 'approved');
      const held = find(id);
      const next = patch(id, {
        amount,
        computedAmount: held.computedAmount ?? held.amount,
        amountSource: 'override',
        overrideReason: reason,
        overrideBy: OFFICER.id,
        overrideByName: OFFICER.name,
      });
      record(next, 'changeClaimAmount', { from: held.amount, amount, reason });
      return outcome(next, reason);
    },
    markPaid,
    markPaidMany: (items) =>
      settle(
        items.map((i) => i.killmailId),
        (id) => markPaid(items.find((i) => i.killmailId === id)!)
      ),
  };
}
