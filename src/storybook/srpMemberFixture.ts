/**
 * Sample SRP data for the member page's stories: the corp's rules, the pilot's
 * claims in every state and their lost ships, answered in place of the backend through
 * `setSrpMemberBackendOverride`. Never imported by the app.
 */
import type { SrpMemberBackend } from '@/features/corp/srp/srpMemberBackend';
import type { LostLoss, MemberClaim } from '@/features/corp/srp/srpMemberModel';
import type { SrpStatus } from '@/features/corp/srpTypes';

const DAY = 86_400_000;
const HASH = 'c'.repeat(40);

// Real SDE ids, so the page names them as it would in the app.
const FEROX = 16227;
const CERBERUS = 11993;
const GILA = 17715;
const VEXOR_NAVY = 17843;
const HURRICANE = 24702;
const CAPSULE = 670;
const CRUISER_GROUP = 26;
const JITA = 30000142;
const AMARR = 30002187;
const RENS = 30002510;
const HEK = 30002053;

export const SRP_FIXTURE_CORPORATION_ID = 98765432;

export interface SrpFixtureOptions {
  enabled?: boolean;
  requireFleetOrFc?: boolean;
  noClaims?: boolean;
  noLosses?: boolean;
}

const claim = (
  now: number,
  killmailId: number,
  hullTypeId: number,
  solarSystemId: number,
  daysAgo: number,
  over: Partial<MemberClaim>
): MemberClaim => ({
  killmailId,
  killmailHash: HASH,
  hullTypeId,
  classId: 0,
  solarSystemId,
  killedAt: now - daysAgo * DAY,
  filedAt: now - (daysAgo - 0.5) * DAY,
  state: 'pending',
  amount: null,
  rejectionReason: null,
  refileCount: 0,
  ...over,
});

const refusal = (reason: string) => Object.assign(new Error(reason), { details: { reason } });

export function createSrpMemberFixture(
  now: number,
  options: SrpFixtureOptions = {}
): SrpMemberBackend {
  const { enabled = true, requireFleetOrFc = false, noClaims = false, noLosses = false } = options;
  const status: SrpStatus = enabled
    ? {
        corporationId: SRP_FIXTURE_CORPORATION_ID,
        enabled: true,
        settings: {
          killmailPct: 70,
          appraisalPct: null,
          hullRules: [{ scope: 'hull', id: CAPSULE, kind: 'not-covered' }],
          windowDays: 30,
          requireFleetOrFc,
        },
      }
    : { corporationId: SRP_FIXTURE_CORPORATION_ID, enabled: false };

  let claims: MemberClaim[] = noClaims
    ? []
    : [
        claim(now, 7001, CERBERUS, AMARR, 2, { state: 'pending' }),
        claim(now, 7002, GILA, RENS, 4, { state: 'approved', amount: 156_000_000 }),
        claim(now, 7003, VEXOR_NAVY, HEK, 12, { state: 'paid', amount: 98_500_000 }),
        claim(now, 7004, FEROX, JITA, 9, {
          state: 'rejected',
          amount: 61_000_000,
          rejectionReason: 'Not a fleet loss: no FC listed and the kill was a solo roam.',
        }),
        claim(now, 7005, HURRICANE, AMARR, 20, {
          state: 'rejected',
          refileCount: 1,
          rejectionReason: 'Still no FC named.',
        }),
      ];

  const loss = (id: number, hull: number, system: number, daysAgo: number): LostLoss => ({
    killmailId: id,
    killmailHash: HASH,
    hullTypeId: hull,
    classId: CRUISER_GROUP,
    solarSystemId: system,
    killedAt: now - daysAgo * DAY,
  });
  const losses = noLosses
    ? []
    : [
        loss(8001, HURRICANE, JITA, 1),
        loss(7001, CERBERUS, AMARR, 2),
        loss(8002, CAPSULE, RENS, 3),
        loss(8003, FEROX, HEK, 6),
        loss(8004, GILA, AMARR, 45),
      ];

  return {
    status: async () => status,
    claims: async () => claims,
    lostLosses: async () => losses,
    file: async (_c, _corp, input) => {
      if (input.killmail.includes('notcovered')) throw refusal('not-covered');
      if (input.killmail.includes('mine')) throw refusal('not-your-loss');
      const killmailId = Number(/(\d+)/.exec(input.killmail)?.[1] ?? 9000);
      if (input.note !== undefined) {
        claims = claims.map((c) =>
          c.killmailId === killmailId ? { ...c, state: 'pending', refileCount: 1 } : c
        );
      } else {
        claims = [...claims, claim(now, killmailId, HURRICANE, JITA, 1, { state: 'pending' })];
      }
      return { killmailId, state: 'pending', amount: null, basis: null };
    },
  };
}
