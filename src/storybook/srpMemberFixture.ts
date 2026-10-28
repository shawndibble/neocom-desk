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

/** The preview's price and loss facts, the same for every sample loss. */
const PREVIEW_FACTS = {
  killedAt: Date.parse('2026-10-22T20:05:00Z'),
  solarSystemId: JITA,
  quote: {
    kind: 'amount',
    isk: 130_900_000,
    basis: { step: 'killmail-percent', percent: 70 },
  },
  hullRule: { scope: 'hull', id: HURRICANE, kind: 'pay-percent' },
  values: { killmailValue: 187_000_000, hullValue: 71_000_000, fitValue: 116_000_000 },
} as const;

export const SRP_FIXTURE_CORPORATION_ID = 98765432;

export interface SrpFixtureOptions {
  enabled?: boolean;
  requireFleetOrFc?: boolean;
  noClaims?: boolean;
  noLosses?: boolean;
  /** The corp checks Hurricanes against a Doctrine Fit (see `previewDoctrine`). */
  doctrine?: boolean;
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
  const {
    enabled = true,
    requireFleetOrFc = false,
    noClaims = false,
    noLosses = false,
    doctrine = false,
  } = options;
  const status: SrpStatus = enabled
    ? {
        corporationId: SRP_FIXTURE_CORPORATION_ID,
        enabled: true,
        settings: {
          killmailPct: 70,
          appraisalPct: null,
          hullRules: [
            { scope: 'hull', id: CAPSULE, kind: 'not-covered' },
            ...(doctrine
              ? [
                  {
                    scope: 'hull' as const,
                    id: HURRICANE,
                    kind: 'pay-percent' as const,
                    doctrineIds: ['d-hurricane'],
                  },
                ]
              : []),
          ],
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
    // A Hurricane is checked: `ondoctrine` in the link matches, a lost-ship tap or any other
    // Hurricane link is off doctrine, and every other hull is not checked.
    previewDoctrine: async (_c, _corp, killmail) => {
      const killmailId = Number(/(?:kill|killmails)\/(\d+)/.exec(killmail)?.[1] ?? 0);
      const hullTypeId = killmailId === 8003 ? FEROX : HURRICANE;
      if (killmail.includes('unchecked') || hullTypeId === FEROX) {
        return {
          ...PREVIEW_FACTS,
          killmailId,
          hullTypeId: FEROX,
          check: { status: 'not-checked' },
        };
      }
      if (killmail.includes('ondoctrine')) {
        return {
          ...PREVIEW_FACTS,
          killmailId,
          hullTypeId,
          check: {
            status: 'matched',
            doctrineId: 'd-hurricane',
            doctrineName: 'Hurricane - artillery',
          },
        };
      }
      return {
        ...PREVIEW_FACTS,
        killmailId,
        hullTypeId,
        check: {
          status: 'off-doctrine',
          doctrineId: 'd-hurricane',
          doctrineName: 'Hurricane - artillery',
          diff: {
            missingModules: [2048],
            extraModules: [519, 519],
            missingRigs: [31059],
            extraRigs: [],
          },
        },
      };
    },
    // A Hurricane fit: 519 (Gyrostabilizer-class sample) twice and 2048 on the high rack, a rig, a drone.
    killmail: async (killmailId) => ({
      killmail_id: killmailId,
      killmail_time: new Date(now - DAY).toISOString(),
      solar_system_id: JITA,
      victim: {
        ship_type_id: HURRICANE,
        items: [
          { item_type_id: 2420, flag: 27, quantity_destroyed: 1, singleton: 0 },
          { item_type_id: 2420, flag: 28, quantity_dropped: 1, singleton: 0 },
          { item_type_id: 519, flag: 11, quantity_destroyed: 1, singleton: 0 },
          { item_type_id: 519, flag: 12, quantity_destroyed: 1, singleton: 0 },
          { item_type_id: 31055, flag: 92, quantity_destroyed: 1, singleton: 0 },
          { item_type_id: 2488, flag: 87, quantity_destroyed: 5, singleton: 0 },
          { item_type_id: 34, flag: 5, quantity_dropped: 1000, singleton: 0 },
        ],
      },
      attackers: [{ final_blow: true, ship_type_id: GILA }, { ship_type_id: CERBERUS }],
    }),
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
