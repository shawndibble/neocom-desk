import {
  CHARACTER_ID,
  CHARACTER_NAME,
  CORPORATION_ID,
  CORPORATION_NAME,
} from '../../../e2e/support/fixtureData';
import { DAY_MS, HOUR_MS } from '../../../src/lib/age';
import { VETTING_CHECKS } from '../../../functions/src/vettingEngine';
import type {
  VettingAssessment,
  VettingCorpInfo,
  VettingFlag,
  VettingOverview,
  VettingRawPage,
  VettingRawRow,
  VettingReview,
  VettingReviewSummary,
  VettingSettings,
  VettingState,
  VettingStatus,
} from '../../../functions/src/vettingEngine';

const NOW = Date.now();
const now = () => NOW;

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
  kind: i === 6 || i === 3 ? 'promotion' : 'application',
  role: i === 6 ? 'Director' : i === 3 ? 'Accountant' : undefined,
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
  { id: 92_000_002, name: 'Sebiestor Salvage', category: 'corporation' as const },
  { id: 92_000_003, name: 'Pator Mining Co', category: 'corporation' as const },
];

function flagsFor(summary: VettingReviewSummary, characterId: number): VettingFlag[] {
  const catalog: VettingFlag[] = [
    {
      check: 'watchlistIsk',
      severity: 'critical',
      characterIds: [characterId],
      facts: { received: 430_000_000, sent: 0, rows: 3, partyId: 93_100_003 },
      evidence: [
        {
          characterId,
          at: new Date(now() - 40 * DAY_MS).toISOString(),
          partyId: 93_100_003,
          what: 'player_donation',
          amount: 250_000_000,
        },
        {
          characterId,
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
      characterIds: [characterId],
      facts: { joined: 5 },
      evidence: [],
      evidenceTotal: 0,
    },
    {
      check: 'thinCharacter',
      severity: 'warning',
      characterIds: [characterId],
      facts: { skillPoints: 4_200_000, ageDays: 400 },
      evidence: [],
      evidenceTotal: 0,
    },
  ];
  return (summary.worst === 'critical' ? catalog : catalog.slice(1)).slice(0, summary.flags);
}

function assessmentFor(summary: VettingReviewSummary, characterId: number): VettingAssessment {
  const flags = flagsFor(summary, characterId);
  return {
    flags,
    checks: VETTING_CHECKS.map((check) => ({
      check,
      state: flags.some((flag) => flag.check === check) ? ('flag' as const) : ('clear' as const),
      missingFor: [],
    })),
  };
}

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
    assessment: assessmentFor(summary, pilot.characterId),
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
  const iso = (daysAgo: number) => new Date(now() - daysAgo * DAY_MS).toISOString();
  const rows: VettingRawRow[] = Array.from({ length: 12 }, (_, i) => {
    const partyId = PARTIES[i % PARTIES.length].id;
    switch (source) {
      case 'wallet':
        return {
          characterId: pilot,
          at: iso(i * 9 + 2),
          what: 'player_donation',
          partyId,
          amount: 5_000_000 * (i + 1),
        };
      case 'mail':
        return {
          characterId: pilot,
          at: iso(i * 9 + 2),
          what: i % 2 ? 'Sent' : 'Received',
          partyId,
          recipients: [partyId],
        };
      case 'contact':
        return { characterId: pilot, at: null, what: '', partyId, standing: [10, -5, 5][i % 3] };
      case 'contract':
        return {
          characterId: pilot,
          at: iso(i * 9 + 2),
          what: 'item_exchange',
          partyId,
          status: 'finished',
          amount: 2_000_000 * (i + 1),
        };
      case 'skills':
        return { characterId: pilot, at: null, what: '', skillId: 3380, level: 1 + (i % 5) };
      default:
        return {
          characterId: pilot,
          at: iso((i + 1) * 200),
          what: '',
          corporationId: 92_000_001 + (i % 3),
          joined: iso((i + 1) * 200),
          left: i === 0 ? null : iso(i * 200),
        };
    }
  });
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
    kind: 'promotion',
    role: 'Accountant',
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
