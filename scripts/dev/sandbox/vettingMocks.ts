/**
 * Vetting callable answers for the sandbox. Every vetting read is a server-computed callable that
 * first verifies an EVE access token with CCP, which a fake token cannot pass, so the browser
 * answers them here (`vettingAnswer`, wired to the `vettingCall` route in moons-sandbox.local.ts).
 * Shapes: functions/src/vettingEngine.ts. Read-only: nothing a page changes is saved.
 */
import {
  CHARACTER_ID,
  CHARACTER_NAME,
  CORPORATION_ID,
  CORPORATION_NAME,
} from '../../../e2e/support/fixtureData';
import { DAY_MS, HOUR_MS } from '../../../src/lib/age';
import { VETTING_CHECKS } from '../../../functions/src/vettingEngine';
import type {
  VettingCorpInfo,
  VettingOverview,
  VettingRawPage,
  VettingReview,
  VettingReviewSummary,
  VettingSettings,
  VettingState,
  VettingStatus,
} from '../../../functions/src/vettingEngine';

const now = () => Date.now();

const SETTINGS: VettingSettings = {
  on: true,
  watchlist: [
    { id: 93_100_001, name: 'Blackwater Reavers', category: 'corporation' },
    { id: 93_100_002, name: 'Nyx Brigade', category: 'alliance' },
    { id: 93_100_003, name: 'Kestrel Vane', category: 'character' },
  ],
  signOffs: { application: 1, promotion: 2 },
  welcome: 'Welcome. Add every character you fly, then share them with our recruiters.',
  contact: 'Dev Recruiter',
  questions: [
    { id: 'q1', label: 'Why do you want to join?', required: true },
    { id: 'q2', label: 'What time zone do you play in?', required: false },
  ],
  minimums: { ageDays: 30, skillPoints: 5_000_000, characters: 1 },
  rejection: { wording: 'rejected', showReason: false },
  inviteOnly: false,
  notifyReviewers: true,
  mailDecision: true,
};

const APPLICANTS = [
  { id: 94_000_001, name: 'Aldric Thorne' },
  { id: 94_000_002, name: 'Brisa Quell' },
  { id: 94_000_003, name: 'Corvin Ash' },
  { id: 94_000_004, name: 'Dessa Moor' },
  { id: 94_000_005, name: 'Elio Frane' },
  { id: 94_000_006, name: 'Fenna Roux' },
  { id: 94_000_007, name: 'Garr Bellamy' },
  { id: 94_000_008, name: 'Hollis Wren' },
];
const STATES: VettingState[] = [
  'open',
  'open',
  'open',
  'requested',
  'accepted',
  'rejected',
  'open',
  'draft',
];

const SUMMARIES: VettingReviewSummary[] = APPLICANTS.map((a, i) => ({
  id: `rev${i + 1}`,
  kind: i === 6 ? 'promotion' : 'application',
  role: i === 6 ? 'Director' : undefined,
  state: STATES[i],
  pilot: {
    characterId: a.id,
    name: a.name,
    corporationName: i % 2 === 0 ? 'Hedion Haulers' : 'Pator Mining Co',
  },
  characters: 1 + (i % 3),
  flags: [3, 0, 1, 0, 0, 2, 1, 0][i],
  worst: (
    [
      'critical',
      undefined,
      'warning',
      undefined,
      undefined,
      'critical',
      'warning',
      undefined,
    ] as const
  )[i],
  missing: i % 4 === 3 ? 1 : 0,
  signed: [0, 1, 0, 0, 1, 1, 0, 0][i],
  needed: i === 6 ? 2 : 1,
  yours: i === 0,
  readAt: STATES[i] === 'requested' || STATES[i] === 'draft' ? null : now() - (i + 1) * 5 * HOUR_MS,
  createdAt: now() - (i + 2) * DAY_MS,
  decidedAt: STATES[i] === 'accepted' || STATES[i] === 'rejected' ? now() - i * HOUR_MS : null,
  ...(i === 3 ? { requestedBy: { characterId: CHARACTER_ID, name: CHARACTER_NAME } } : {}),
}));

const overview = (): VettingOverview => ({
  settings: SETTINGS,
  canConfigure: true,
  reviews: SUMMARIES,
  invites: [
    {
      code: 'DEVINVITE1',
      label: 'Discord recruits',
      createdBy: { characterId: CHARACTER_ID, name: CHARACTER_NAME },
      createdAt: now() - 6 * DAY_MS,
      uses: 4,
    },
  ],
});

const PARTIES = [
  { id: 93_100_001, name: 'Blackwater Reavers', category: 'corporation' as const },
  { id: 93_100_003, name: 'Kestrel Vane', category: 'character' as const },
  { id: 92_000_001, name: 'Hedion Haulers', category: 'corporation' as const },
];

function review(reviewId: string): VettingReview {
  const summary = SUMMARIES.find((s) => s.id === reviewId) ?? SUMMARIES[0];
  const pilot = summary.pilot;
  return {
    ...summary,
    corporationId: CORPORATION_ID,
    note: 'Looking for a mining corp with a good moon program. Played for three years.',
    answers: [
      {
        questionId: 'q1',
        label: SETTINGS.questions[0].label,
        answer: 'Steady moon income and a friendly crew.',
      },
      { questionId: 'q2', label: SETTINGS.questions[1].label, answer: 'EU evenings' },
    ],
    barred: false,
    reportCharacters: [
      {
        characterId: pilot.characterId,
        name: pilot.name,
        corporationId: 92_000_001,
        corporationName: pilot.corporationName,
        birthday: new Date(now() - 1_100 * DAY_MS).toISOString(),
        skillPoints: 42_000_000,
        corporations: 6,
        missing: [],
      },
    ],
    parties: PARTIES,
    assessment: {
      flags: [
        {
          check: 'watchlistIsk',
          severity: 'critical',
          characterIds: [pilot.characterId],
          facts: { total: 480_000_000, count: 3 },
          evidence: [
            {
              characterId: pilot.characterId,
              at: new Date(now() - 40 * DAY_MS).toISOString(),
              partyId: 93_100_003,
              what: 'player_donation',
              amount: 250_000_000,
            },
            {
              characterId: pilot.characterId,
              at: new Date(now() - 22 * DAY_MS).toISOString(),
              partyId: 93_100_001,
              what: 'player_donation',
              amount: 180_000_000,
            },
          ],
          evidenceTotal: 3,
        },
        {
          check: 'corpHopping',
          severity: 'warning',
          characterIds: [pilot.characterId],
          facts: { joins: 5, days: 180 },
          evidence: [],
          evidenceTotal: 0,
        },
      ].slice(0, Math.max(summary.flags, 1) > 1 ? 2 : 1),
      checks: VETTING_CHECKS.map((check, i) => ({
        check,
        state: i < 2 && summary.flags > 0 ? ('flag' as const) : ('clear' as const),
        missingFor: [],
      })),
    },
    signOffs:
      summary.signed > 0
        ? [
            {
              characterId: CHARACTER_ID,
              name: CHARACTER_NAME,
              you: true,
              at: now() - 2 * HOUR_MS,
              decision: 'yes',
            },
          ]
        : [],
    log: [
      {
        at: summary.createdAt,
        characterId: pilot.characterId,
        name: pilot.name,
        action: 'started',
      },
      {
        at: summary.createdAt + HOUR_MS,
        characterId: pilot.characterId,
        name: pilot.name,
        action: 'shared',
      },
    ],
    deleteAt: now() + 20 * DAY_MS,
    rawCounts: { wallet: 24, contact: 6, mail: 12, contract: 4, skills: 18, history: 6 },
  };
}

function rawRows(reviewId: string, source: string): VettingRawPage {
  const pilot = (SUMMARIES.find((s) => s.id === reviewId) ?? SUMMARIES[0]).pilot.characterId;
  const rows = Array.from({ length: 12 }, (_, i) => ({
    characterId: pilot,
    at: new Date(now() - (i * 9 + 2) * DAY_MS).toISOString(),
    what:
      source === 'wallet'
        ? 'player_donation'
        : source === 'mail'
          ? 'Re: payment'
          : source === 'contact'
            ? 'contact'
            : 'contract',
    partyId: PARTIES[i % PARTIES.length].id,
    amount: source === 'wallet' ? 5_000_000 * (i + 1) : undefined,
    standing: source === 'contact' ? [10, -5, 5][i % 3] : undefined,
    ...(source === 'skills' ? { skillId: 3380, level: 1 + (i % 5) } : {}),
    ...(source === 'history'
      ? {
          corporationId: 92_000_001 + (i % 3),
          joined: new Date(now() - (i + 1) * 200 * DAY_MS).toISOString(),
          left: null,
        }
      : {}),
  }));
  return {
    reviewId,
    source: source as VettingRawPage['source'],
    rows,
    parties: PARTIES,
    next: null,
  };
}

const corpInfo = (): VettingCorpInfo => ({
  corporationId: CORPORATION_ID,
  name: CORPORATION_NAME,
  ticker: 'TEST',
  on: true,
  welcome: SETTINGS.welcome,
  minimums: SETTINGS.minimums,
  inviteOnly: false,
  inviteOk: true,
});

function memberStatus(): VettingStatus {
  const requested = SUMMARIES[3];
  return {
    id: requested.id,
    corporationId: CORPORATION_ID,
    corporationName: CORPORATION_NAME,
    corporationTicker: 'TEST',
    kind: 'application',
    state: 'requested',
    requestedBy: { characterId: CHARACTER_ID, name: CHARACTER_NAME },
    characters: [],
    note: '',
    readAt: null,
    decidedAt: null,
    deleteAt: null,
    openedBy: [],
    contact: SETTINGS.contact,
    questions: SETTINGS.questions,
    answers: [],
    unmet: [],
  };
}

/** The JSON for a vetting action, or undefined when the sandbox does not answer it. */
export function vettingAnswer(action: string, data: Record<string, unknown>): unknown | undefined {
  switch (action) {
    case 'getVettingOverviewCallable':
      return overview();
    case 'openVettingReviewCallable':
      return review(String(data.reviewId));
    case 'getVettingRawRowsCallable':
      return rawRows(String(data.reviewId), String(data.source));
    case 'getVettingCorpCallable':
      return corpInfo();
    case 'getVettingStatusCallable':
      return memberStatus();
    case 'listMyVettingRequestsCallable':
      return [
        {
          handle: { corporationId: CORPORATION_ID, reviewId: 'rev4', key: 'dev-key' },
          status: memberStatus(),
        },
      ];
    default:
      return undefined;
  }
}
