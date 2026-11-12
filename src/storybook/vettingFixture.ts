/**
 * An in-memory `VettingBackend` for stories, component tests and the e2e spec: one corp's
 * settings, a queue of reviews and an applicant's draft, all sample data. Reports are worked out
 * by the real `assessVetting`, so a flag here is one the checks would raise. Install it with
 * `setVettingBackendOverride(createVettingFixture())`; nothing touches Firebase or EVE.
 *
 * A read takes an "access token" like every real call. The fixture reads `fixture:<characterId>`
 * as that sample character and anything else as the next unread one.
 */
import {
  assessVetting,
  settleVettingAnswers,
  unmetVettingMinimums,
  VETTING_DEFAULT_SETTINGS,
  VETTING_INVITES_MAX,
  VETTING_KEEP_DAYS,
  VETTING_OPEN_KEEP_DAYS,
  type VettingAnswer,
  type VettingCharacterInput,
  type VettingDealing,
  type VettingInvite,
  type VettingKind,
  type VettingParty,
  type VettingReview,
  type VettingReviewSummary,
  type VettingSettings,
  type VettingSource,
  type VettingState,
  type VettingStatus,
  type VettingWatchEntry,
} from '@/engine/vetting';
import type { VettingBackend, VettingHandle } from '@/features/corp/vetting/vettingBackend';
import { DAY_MS, HOUR_MS } from '@/lib/age';
import { SAMPLE_ACTIVE_CHARACTER, SAMPLE_CHARACTERS } from './sampleData';

export const VETTING_FIXTURE_CORPORATION = {
  corporationId: SAMPLE_ACTIVE_CHARACTER.corporationId,
  name: SAMPLE_ACTIVE_CHARACTER.corporationName,
  ticker: 'BRASS',
};

/** The review ids stories and specs open by name. */
export const VETTING_FIXTURE_REVIEWS = {
  flagged: 'v-0042',
  promotion: 'v-0041',
  nothing: 'v-0040',
  incomplete: 'v-0039',
  waiting: 'v-0038',
  decided: 'v-0031',
} as const;

const BLACK_KITE = 98111001;
const CORVIN = 2118000010;
const ORRIN = 2118000011;

/**
 * A corp that set everything up: a welcome and contact line, three questions (two required),
 * minimums the sample applicant meets, and a softer no that shows its reason. Pass it as
 * `settings` to see the options at work; the default fixture is a corp that never opened Settings.
 */
export const VETTING_FIXTURE_CONFIGURED: Partial<VettingSettings> = {
  welcome:
    'We fly out of Hollow Reach, EU and early US evenings. Mining, hauling and home defence.\nRead the pinned mail before you apply.',
  contact: 'Ilse Marrow or Bram Soto, in the "Brass Public" channel.',
  questions: [
    { id: 'q-timezone', label: 'What timezone do you play in?', required: true },
    { id: 'q-referral', label: 'Who told you about us?', required: false },
    { id: 'q-ships', label: 'What do you fly most?', required: true },
  ],
  minimums: { ageDays: 365, skillPoints: 20_000_000, characters: 2 },
  rejection: { wording: 'notNow', showReason: true },
};

const SAMPLE_ANSWERS: Record<string, string> = {
  'q-timezone': 'EU, most evenings from 19:00 EVE time.',
  'q-referral': 'Hesper Lune, from the Hollow Reach fleet.',
  'q-ships': 'Orca and Hulk in the belt, a Stabber Fleet Issue for home defence.',
};

const PARTIES: VettingParty[] = [
  { id: CORVIN, name: 'Corvin Hale', category: 'character', corporationId: BLACK_KITE },
  { id: BLACK_KITE, name: 'Black Kite Syndicate', category: 'corporation' },
  { id: ORRIN, name: 'Orrin Dask', category: 'character', corporationId: 98111002 },
];

const WATCHLIST: VettingWatchEntry[] = [
  { id: BLACK_KITE, name: 'Black Kite Syndicate', category: 'corporation' },
  { id: 99111001, name: 'Pale Meridian Pact', category: 'alliance' },
  { id: 2118000012, name: 'Sable Orrow', category: 'character' },
];

interface Sample {
  characterId: number;
  name: string;
  corporationId: number;
  corporationName: string;
  /** Years old and skill points, as the report's table shows them. */
  years: number;
  skillPoints: number;
  corporations: number;
  missing?: VettingSource[];
  dealings?: (now: number) => VettingDealing[];
  skills?: { id: number; level: number }[];
}

const iso = (now: number, ago: number) => new Date(now - ago).toISOString();

const donation = (now: number, days: number, partyId: number, amount: number): VettingDealing => ({
  source: 'wallet',
  at: iso(now, days * DAY_MS),
  partyId,
  what: 'player_donation',
  amount,
});

const TAMSIN: Sample = {
  characterId: 2118000001,
  name: 'Tamsin Vell',
  corporationId: 98222001,
  corporationName: 'Hollow Reach Mining',
  years: 7.5,
  skillPoints: 84_200_000,
  corporations: 6,
  // Cynosural Field Theory V, and no declared character flies a capital.
  skills: [{ id: 21603, level: 5 }],
  dealings: (now) => [
    donation(now, 3, CORVIN, 500_000_000),
    donation(now, 10, CORVIN, 400_000_000),
    donation(now, 19, CORVIN, 300_000_000),
    donation(now, 4, ORRIN, -250_000_000),
    donation(now, 9, ORRIN, 90_000_000),
    donation(now, 14, ORRIN, 40_000_000),
    {
      source: 'contract',
      at: iso(now, 2 * DAY_MS),
      partyId: ORRIN,
      what: 'item_exchange',
      amount: 0,
    },
  ],
};
const MIRA: Sample = {
  characterId: 2118000002,
  name: 'Mira Vell',
  corporationId: 98222001,
  corporationName: 'Hollow Reach Mining',
  years: 5.4,
  skillPoints: 31_700_000,
  corporations: 2,
  missing: ['mail'],
};
const VELL_HAULING: Sample = {
  characterId: 2118000003,
  name: 'Vell Hauling',
  corporationId: 1000035,
  corporationName: 'Caldari Provisions',
  years: 2.8,
  skillPoints: 6_100_000,
  corporations: 1,
  dealings: (now) => [
    {
      source: 'contract',
      at: iso(now, 6 * DAY_MS),
      partyId: ORRIN,
      what: 'item_exchange',
      amount: 0,
    },
    { source: 'contract', at: iso(now, 12 * DAY_MS), partyId: ORRIN, what: 'courier', amount: 0 },
  ],
};
const JOSS: Sample = {
  characterId: 2118000004,
  name: 'Joss Arden',
  corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
  corporationName: VETTING_FIXTURE_CORPORATION.name,
  years: 9.1,
  skillPoints: 142_000_000,
  corporations: 4,
  dealings: () => [{ source: 'contact', at: null, partyId: CORVIN, what: 'contact', standing: 5 }],
};
const ARDEN_ORE: Sample = {
  characterId: 2118000005,
  name: 'Arden Ore',
  corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
  corporationName: VETTING_FIXTURE_CORPORATION.name,
  years: 6.7,
  skillPoints: 48_300_000,
  corporations: 2,
};
const PELL: Sample = {
  characterId: 2118000006,
  name: 'Pell Okonru',
  corporationId: 1000045,
  corporationName: 'Science and Trade Institute',
  years: 4.2,
  skillPoints: 39_000_000,
  corporations: 1,
};
const PELL_ALT: Sample = {
  characterId: 2118000007,
  name: 'Okonru Freight',
  corporationId: 1000045,
  corporationName: 'Science and Trade Institute',
  years: 1.3,
  skillPoints: 4_400_000,
  corporations: 1,
};
const DARA: Sample = {
  characterId: 2118000008,
  name: 'Dara Quill',
  corporationId: 98222002,
  corporationName: 'Quill and Sons',
  years: 3.6,
  skillPoints: 22_500_000,
  corporations: 3,
  missing: ['mail', 'wallet'],
};
const REN = { characterId: 2118000009, name: 'Ren Halvard' };
const ILSE = { characterId: 2118000020, name: 'Ilse Marrow' };
const BRAM = { characterId: 2118000021, name: 'Bram Soto' };
const OLD: Sample = {
  characterId: 2118000022,
  name: 'Hesper Lune',
  corporationId: 98222003,
  corporationName: 'Lune Salvage',
  years: 6,
  skillPoints: 61_000_000,
  corporations: 3,
};

/** The applicant's characters, in the order the fixture "reads" them. */
export const VETTING_FIXTURE_APPLICANT = [TAMSIN, MIRA, VELL_HAULING].map((sample) => ({
  characterId: sample.characterId,
  name: sample.name,
}));

function inputFor(sample: Sample, now: number): VettingCharacterInput {
  return {
    characterId: sample.characterId,
    name: sample.name,
    corporationId: sample.corporationId,
    birthday: iso(now, sample.years * 365 * DAY_MS),
    skillPoints: sample.missing?.includes('skills') ? null : sample.skillPoints,
    history: [{ corporationId: sample.corporationId, startDate: iso(now, 400 * DAY_MS) }],
    dealings: sample.dealings?.(now) ?? [],
    skills: sample.skills ?? [],
    missing: sample.missing ?? [],
  };
}

/** A refusal as the callables word one: a code, and the reason in `details` (vettingStore.ts). */
function refusal(reason: string, message = reason): Error {
  const code =
    reason === 'not-found' || reason === 'unknown-corp' || reason === 'unknown-name'
      ? 'not-found'
      : reason === 'bad-key'
        ? 'permission-denied'
        : 'failed-precondition';
  return Object.assign(new Error(message), { code: `functions/${code}`, details: { reason } });
}

interface ReviewSeed {
  id: string;
  kind: VettingKind;
  role?: string;
  state: VettingState;
  samples: Sample[];
  pilot?: { characterId: number; name: string; corporationName: string };
  note?: string;
  /** The label of the invite link the application started from. */
  invite?: string;
  needed: number;
  ageMs: number;
  signOffs?: VettingReview['signOffs'];
  requestedBy?: { characterId: number; name: string };
}

function buildReview(
  seed: ReviewSeed,
  now: number,
  watchlist: number[],
  answers: VettingAnswer[] = []
): VettingReview {
  const [main] = seed.samples;
  const read = seed.samples.length > 0;
  const assessment = read
    ? assessVetting({
        now,
        characters: seed.samples.map((sample) => inputFor(sample, now)),
        parties: PARTIES,
        watchlist,
      })
    : null;
  const pilot = seed.pilot ?? {
    characterId: main.characterId,
    name: main.name,
    corporationName: main.corporationName,
  };
  const at = now - seed.ageMs;
  const decidedAt = seed.state === 'accepted' || seed.state === 'rejected' ? at + HOUR_MS : null;
  const signOffs = seed.signOffs ?? [];
  return {
    id: seed.id,
    kind: seed.kind,
    ...(seed.role ? { role: seed.role } : {}),
    state: seed.state,
    pilot,
    characters: seed.samples.length,
    flags: assessment?.flags.length ?? 0,
    ...(assessment?.flags[0] ? { worst: assessment.flags[0].severity } : {}),
    missing: assessment?.checks.filter((check) => check.state === 'missing').length ?? 0,
    signed: signOffs.length,
    needed: seed.needed,
    yours: seed.state === 'open' && !signOffs.some((signOff) => signOff.you),
    readAt: read ? at : null,
    createdAt: at - (read ? 20 * 60_000 : 0),
    decidedAt,
    ...(seed.invite ? { invite: seed.invite } : {}),
    corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
    note: seed.note ?? '',
    answers: read && seed.kind === 'application' ? answers : [],
    ...(seed.requestedBy ? { requestedBy: seed.requestedBy } : {}),
    barred: false,
    reportCharacters: seed.samples.map((sample) => ({
      characterId: sample.characterId,
      name: sample.name,
      corporationId: sample.corporationId,
      corporationName: sample.corporationName,
      birthday: iso(now, sample.years * 365 * DAY_MS),
      skillPoints: sample.missing?.includes('skills') ? null : sample.skillPoints,
      corporations: sample.corporations,
      missing: sample.missing ?? [],
    })),
    parties: PARTIES,
    assessment,
    signOffs,
    log: [
      ...(seed.requestedBy
        ? [{ at: at - DAY_MS, ...seed.requestedBy, action: 'requested' as const }]
        : [{ at: at - 20 * 60_000, ...pilot, action: 'started' as const }]),
      ...(read
        ? [{ at, characterId: pilot.characterId, name: pilot.name, action: 'shared' as const }]
        : []),
    ],
    // From the moment it is shared: an undecided review goes after `VETTING_OPEN_KEEP_DAYS`.
    deleteAt:
      decidedAt !== null
        ? decidedAt + VETTING_KEEP_DAYS * DAY_MS
        : read
          ? at + VETTING_OPEN_KEEP_DAYS * DAY_MS
          : null,
  };
}

function summaryOf(review: VettingReview): VettingReviewSummary {
  const {
    id,
    kind,
    role,
    state,
    pilot,
    characters,
    flags,
    worst,
    missing,
    signed,
    needed,
    yours,
    readAt,
    createdAt,
    decidedAt,
    invite,
  } = review;
  return {
    id,
    kind,
    ...(role ? { role } : {}),
    state,
    pilot,
    characters,
    flags,
    ...(worst ? { worst } : {}),
    missing,
    signed,
    needed,
    yours,
    readAt,
    createdAt,
    decidedAt,
    ...(invite ? { invite } : {}),
  };
}

export interface VettingFixtureOptions {
  /** The fixture's "now"; defaults to the moment it is made. */
  now?: number;
  /** Vetting on for the corp (default) or off. */
  on?: boolean;
  /** No reviews at all: the empty queue. */
  empty?: boolean;
  /** The signed-in sample pilot is no Director: no Settings. */
  canConfigure?: boolean;
  /**
   * An officer asked the signed-in sample pilot for a promotion review: still waiting
   * (`true`, answered by `myRequests`) or already shared and with the reviewers (`'shared'`).
   */
  request?: boolean | 'shared';
  /** Where the applicant's own application stands when the page opens. */
  application?: 'none' | 'draft' | 'sent' | 'opened' | 'accepted' | 'rejected';
  /** What the corp set, over the defaults (`VETTING_FIXTURE_CONFIGURED` is one that set it all). */
  settings?: Partial<VettingSettings>;
  /** Every call waits this long first, so a "Reading" row can be seen. */
  delayMs?: number;
}

export interface VettingFixture extends VettingBackend {
  /** The handle of the applicant's application, for a story to put where the page looks. */
  applicationHandle: VettingHandle;
  /** The handle of the member's review request, likewise. */
  requestHandle: VettingHandle;
  /** What each method was called with, newest last: tests assert on it. */
  calls: { method: keyof VettingBackend; args: unknown[] }[];
}

export function createVettingFixture(options: VettingFixtureOptions = {}): VettingFixture {
  const now = options.now ?? Date.now();
  const corp = VETTING_FIXTURE_CORPORATION;
  const reviewer = SAMPLE_ACTIVE_CHARACTER;
  let settings: VettingSettings = {
    ...VETTING_DEFAULT_SETTINGS,
    on: options.on ?? true,
    watchlist: [...WATCHLIST],
    ...options.settings,
  };
  const answersNow = (): VettingAnswer[] =>
    settings.questions.flatMap((question) =>
      SAMPLE_ANSWERS[question.id]
        ? [{ questionId: question.id, label: question.label, answer: SAMPLE_ANSWERS[question.id] }]
        : []
    );
  let invites: VettingInvite[] = options.empty
    ? []
    : [
        {
          code: 'inv-forum',
          label: 'Forum post',
          createdBy: ILSE,
          createdAt: now - 3 * DAY_MS,
          uses: 4,
        },
        {
          code: 'inv-pell',
          label: 'Pell Okonru',
          createdBy: { characterId: reviewer.characterId, name: reviewer.name },
          createdAt: now - 2 * DAY_MS,
          uses: 1,
        },
      ];
  const liveInvite = (code: string | undefined) => invites.find((invite) => invite.code === code);
  const watchIds = () => settings.watchlist.map((entry) => entry.id);

  const seeds: ReviewSeed[] = options.empty
    ? []
    : [
        {
          id: VETTING_FIXTURE_REVIEWS.flagged,
          kind: 'application',
          state: 'open',
          samples: [TAMSIN, MIRA, VELL_HAULING],
          note: 'Vell Hauling is my Jita hauler. Orrin is my brother, we share ISK sometimes.',
          needed: 1,
          ageMs: 2 * HOUR_MS,
        },
        {
          id: VETTING_FIXTURE_REVIEWS.promotion,
          kind: 'promotion',
          role: 'Director',
          state: 'open',
          samples: [JOSS, ARDEN_ORE],
          needed: 2,
          ageMs: DAY_MS,
          requestedBy: BRAM,
          // Decided, and hidden until the caller decides: no `decision` on the wire.
          signOffs: [{ ...ILSE, you: false, at: now - 20 * HOUR_MS }],
        },
        {
          id: VETTING_FIXTURE_REVIEWS.nothing,
          kind: 'application',
          state: 'open',
          samples: [PELL, PELL_ALT],
          invite: 'Pell Okonru',
          needed: 1,
          ageMs: DAY_MS + 3 * HOUR_MS,
        },
        {
          id: VETTING_FIXTURE_REVIEWS.incomplete,
          kind: 'application',
          state: 'open',
          samples: [DARA],
          needed: 1,
          ageMs: 3 * DAY_MS,
        },
        {
          id: VETTING_FIXTURE_REVIEWS.waiting,
          kind: 'promotion',
          role: 'Accountant',
          state: 'requested',
          samples: [],
          pilot: { ...REN, corporationName: corp.name },
          needed: 2,
          ageMs: 2 * DAY_MS,
          requestedBy: { characterId: reviewer.characterId, name: reviewer.name },
        },
        {
          id: VETTING_FIXTURE_REVIEWS.decided,
          kind: 'application',
          state: 'accepted',
          samples: [OLD],
          needed: 1,
          ageMs: 9 * DAY_MS,
          signOffs: [
            {
              characterId: reviewer.characterId,
              name: reviewer.name,
              you: true,
              at: now - 9 * DAY_MS + HOUR_MS,
              decision: 'yes',
              note: 'Known from the Hollow Reach fleet.',
            },
          ],
        },
      ];
  const reviews = new Map(
    seeds.map((seed) => [seed.id, buildReview(seed, now, watchIds(), answersNow())])
  );
  const waiting = reviews.get(VETTING_FIXTURE_REVIEWS.waiting);
  if (waiting) waiting.barred = true;

  // The pilot's side: one application (public page) and one request (the signed-in member).
  const applicationHandle: VettingHandle = {
    corporationId: corp.corporationId,
    reviewId: 'v-apply',
    key: 'fixture-application-key',
  };
  const requestHandle: VettingHandle = {
    corporationId: corp.corporationId,
    reviewId: 'v-request',
    key: 'fixture-request-key',
  };
  const statuses = new Map<string, VettingStatus>();
  const pools = new Map<string, Sample[]>([
    [applicationHandle.reviewId, [TAMSIN, MIRA, VELL_HAULING]],
    [
      requestHandle.reviewId,
      SAMPLE_CHARACTERS.map((character): Sample => ({
        ...character,
        years: 5,
        skillPoints: 50_000_000,
        corporations: 2,
      })),
    ],
  ]);
  const blankStatus = (
    handle: VettingHandle,
    kind: VettingKind,
    state: VettingState
  ): VettingStatus => ({
    id: handle.reviewId,
    corporationId: corp.corporationId,
    corporationName: corp.name,
    corporationTicker: corp.ticker,
    kind,
    state,
    characters: [],
    note: '',
    readAt: null,
    decidedAt: null,
    deleteAt: null,
    openedBy: [],
    contact: '',
    questions: kind === 'application' ? structuredClone(settings.questions) : [],
    answers: [],
    unmet: [],
  });
  /** An application draft's unmet minimums, worked out as the server does on every read. */
  const withUnmet = (status: VettingStatus): VettingStatus =>
    status.kind !== 'application' || status.state !== 'draft'
      ? status
      : {
          ...status,
          unmet: unmetVettingMinimums(
            settings.minimums,
            status.characters.flatMap((character) => {
              const sample = (pools.get(status.id) ?? []).find(
                (candidate) => candidate.characterId === character.characterId
              );
              return sample
                ? [
                    {
                      birthday: iso(now, sample.years * 365 * DAY_MS),
                      skillPoints: sample.missing?.includes('skills') ? null : sample.skillPoints,
                    },
                  ]
                : [];
            }),
            now
          ),
        };
  const asCharacter = (sample: Sample): VettingStatus['characters'][number] => ({
    characterId: sample.characterId,
    name: sample.name,
    corporationName: sample.corporationName,
    missing: sample.missing ?? [],
  });

  const application = options.application ?? 'none';
  if (application !== 'none') {
    const status = blankStatus(applicationHandle, 'application', 'draft');
    status.characters = [TAMSIN, MIRA, VELL_HAULING].map(asCharacter);
    if (application !== 'draft') {
      status.state =
        application === 'accepted' || application === 'rejected' ? application : 'open';
      status.contact = settings.contact;
      status.answers = answersNow();
      status.readAt = now - 2 * HOUR_MS;
      status.deleteAt = status.readAt + VETTING_OPEN_KEEP_DAYS * DAY_MS;
      if (application !== 'sent') {
        status.openedBy = [{ name: reviewer.name, at: now - 4 * 60_000 }];
      }
      if (application === 'accepted' || application === 'rejected') {
        status.decidedAt = now - 60_000;
        status.deleteAt = status.decidedAt + VETTING_KEEP_DAYS * DAY_MS;
      }
      if (application === 'rejected') {
        status.rejection = {
          wording: settings.rejection.wording,
          reasons: settings.rejection.showReason
            ? ['We are full on haulers this month. Ask again after the next deployment.']
            : [],
        };
      }
    }
    statuses.set(applicationHandle.reviewId, withUnmet(status));
  }
  if (options.request) {
    const shared = options.request === 'shared';
    statuses.set(requestHandle.reviewId, {
      ...blankStatus(requestHandle, 'promotion', shared ? 'open' : 'requested'),
      role: 'Director',
      requestedBy: BRAM,
      ...(shared
        ? {
            characters: (pools.get(requestHandle.reviewId) ?? []).map(asCharacter),
            readAt: now - 3 * HOUR_MS,
            deleteAt: now - 3 * HOUR_MS + VETTING_OPEN_KEEP_DAYS * DAY_MS,
          }
        : {}),
    });
  }

  const statusOf = (handle: VettingHandle): VettingStatus => {
    const status = statuses.get(handle.reviewId);
    if (!status || (handle.key !== applicationHandle.key && handle.key !== requestHandle.key)) {
      throw refusal('bad-key');
    }
    return status;
  };
  const put = (next: VettingStatus): VettingStatus => {
    const status = withUnmet(next);
    statuses.set(status.id, status);
    return structuredClone(status);
  };
  /** Reads one character into a status: the one the token names, else the next unread one. */
  const read = (status: VettingStatus, accessToken: string): VettingStatus => {
    if (status.state !== 'draft' && status.state !== 'requested') throw refusal('wrong-state');
    const pool = pools.get(status.id) ?? [];
    const named = /^fixture:(\d+)$/.exec(accessToken);
    const sample = named
      ? pool.find((candidate) => candidate.characterId === Number(named[1]))
      : (pool.find(
          (candidate) =>
            !status.characters.some((character) => character.characterId === candidate.characterId)
        ) ??
        // Everyone is read: a second sign-in is a re-read of whoever was missing something.
        pool.find((candidate) => (candidate.missing ?? []).length > 0));
    if (!sample) throw refusal('esi-forbidden');
    const again = status.characters.some(
      (character) => character.characterId === sample.characterId
    );
    return put({
      ...status,
      characters: again
        ? status.characters.map((character) =>
            character.characterId === sample.characterId ? { ...character, missing: [] } : character
          )
        : [...status.characters, asCharacter(sample)],
    });
  };

  const calls: VettingFixture['calls'] = [];
  const overview = () => ({
    settings: structuredClone(settings),
    canConfigure: options.canConfigure ?? true,
    reviews: [...reviews.values()].map(summaryOf),
    invites: structuredClone(invites),
  });
  const reviewOf = (reviewId: string): VettingReview => {
    const review = reviews.get(reviewId);
    if (!review) throw refusal('not-found');
    return review;
  };

  const backend: VettingBackend = {
    corpInfo: async (corporationId, invite) => {
      if (corporationId !== corp.corporationId) throw refusal('unknown-corp');
      const inviteOk = !settings.inviteOnly || liveInvite(invite) !== undefined;
      // As the server: an invite-only corp tells a stranger nothing it wrote or set.
      return {
        ...corp,
        on: settings.on,
        welcome: inviteOk ? settings.welcome : '',
        minimums: { ...(inviteOk ? settings.minimums : VETTING_DEFAULT_SETTINGS.minimums) },
        inviteOnly: settings.inviteOnly,
        inviteOk,
      };
    },
    start: async (corporationId, accessToken, invite) => {
      if (corporationId !== corp.corporationId) throw refusal('unknown-corp');
      if (!settings.on) throw refusal('vetting-off');
      const used = liveInvite(invite);
      if (settings.inviteOnly && !used) throw refusal('invite-required');
      if (used) used.uses += 1;
      const status = read(blankStatus(applicationHandle, 'application', 'draft'), accessToken);
      return { handle: { ...applicationHandle }, status };
    },
    addCharacter: async (handle, accessToken) => read(statusOf(handle), accessToken),
    removeCharacter: async (handle, characterId) => {
      const status = statusOf(handle);
      return put({
        ...status,
        characters: status.characters.filter((character) => character.characterId !== characterId),
      });
    },
    submit: async (handle, note, given) => {
      const status = withUnmet(statusOf(handle));
      if (status.characters.length === 0) throw refusal('no-characters');
      if (status.unmet.length > 0) throw refusal('below-minimum', status.unmet.join(','));
      const { answers, unanswered } = settleVettingAnswers(status.questions, given);
      if (unanswered.length > 0) throw refusal('answers-required');
      return put({
        ...status,
        state: 'open',
        note,
        answers,
        unmet: [],
        contact: settings.contact,
        readAt: now,
        deleteAt: now + VETTING_OPEN_KEEP_DAYS * DAY_MS,
      });
    },
    status: async (handle) => structuredClone(statusOf(handle)),
    withdraw: async (handle) => {
      statusOf(handle);
      statuses.delete(handle.reviewId);
    },
    decline: async (handle) => {
      put({ ...statusOf(handle), state: 'declined' });
    },
    myRequests: async () => {
      const status = statuses.get(requestHandle.reviewId);
      return status?.state === 'requested'
        ? [{ handle: { ...requestHandle }, status: structuredClone(status) }]
        : [];
    },
    overview: async () => overview(),
    open: async (_characterId, _corporationId, reviewId) => {
      const review = reviewOf(reviewId);
      review.log = [
        ...review.log,
        { at: now, characterId: reviewer.characterId, name: reviewer.name, action: 'opened' },
      ];
      return structuredClone(review);
    },
    decide: async (_characterId, _corporationId, reviewId, decision, note) => {
      const review = reviewOf(reviewId);
      if (review.barred) throw refusal('barred');
      if (review.signOffs.some((signOff) => signOff.you)) throw refusal('already-signed');
      // The caller has decided, so every other reviewer's decision is shown.
      review.signOffs = [
        ...review.signOffs.map((signOff) => ({
          ...signOff,
          decision: signOff.decision ?? ('yes' as const),
          note: signOff.note ?? '',
        })),
        {
          characterId: reviewer.characterId,
          name: reviewer.name,
          you: true,
          at: now,
          decision,
          note,
          // Stamped when written, as the server does: a later settings change does not move it.
          reasonShown: settings.rejection.showReason,
        },
      ];
      review.signed = review.signOffs.length;
      review.yours = false;
      // Open until every sign-off needed is in; then any "no" rejects it.
      if (review.signed >= review.needed) {
        const refused = review.signOffs.some((signOff) => signOff.decision === 'no');
        review.state = refused ? 'rejected' : 'accepted';
        review.decidedAt = now;
        review.deleteAt = now + VETTING_KEEP_DAYS * DAY_MS;
      }
      review.log = [
        ...review.log,
        { at: now, characterId: reviewer.characterId, name: reviewer.name, action: 'decided' },
      ];
      return structuredClone(review);
    },
    request: async (_characterId, _corporationId, memberName, role) => {
      if (/^nobody/i.test(memberName)) throw refusal('not-a-member');
      const id = `v-req-${reviews.size + 1}`;
      const review = buildReview(
        {
          id,
          kind: 'promotion',
          role,
          state: 'requested',
          samples: [],
          pilot: {
            characterId: 2118000100 + reviews.size,
            name: memberName,
            corporationName: corp.name,
          },
          needed: settings.signOffs.promotion,
          ageMs: 0,
          requestedBy: { characterId: reviewer.characterId, name: reviewer.name },
        },
        now,
        watchIds()
      );
      review.barred = true;
      reviews.set(id, review);
      return overview();
    },
    createInvite: async (_characterId, _corporationId, label) => {
      if (invites.length >= VETTING_INVITES_MAX) throw refusal('invites-full');
      invites = [
        ...invites,
        {
          code: `inv-${invites.length + 1}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          label,
          createdBy: { characterId: reviewer.characterId, name: reviewer.name },
          createdAt: now,
          uses: 0,
        },
      ];
      return overview();
    },
    revokeInvite: async (_characterId, _corporationId, code) => {
      invites = invites.filter((invite) => invite.code !== code);
      return overview();
    },
    saveSettings: async (_characterId, _corporationId, patch) => {
      const added = (patch.addWatchNames ?? []).map((name, index): VettingWatchEntry => {
        if (/^nobody/i.test(name)) throw refusal('unknown-name');
        return { id: 98333000 + settings.watchlist.length + index, name, category: 'corporation' };
      });
      settings = {
        ...settings,
        ...(patch.welcome === undefined ? {} : { welcome: patch.welcome }),
        ...(patch.contact === undefined ? {} : { contact: patch.contact }),
        ...(patch.minimums ? { minimums: patch.minimums } : {}),
        ...(patch.rejection ? { rejection: patch.rejection } : {}),
        ...(patch.inviteOnly === undefined ? {} : { inviteOnly: patch.inviteOnly }),
        ...(patch.notifyReviewers === undefined ? {} : { notifyReviewers: patch.notifyReviewers }),
        ...(patch.mailDecision === undefined ? {} : { mailDecision: patch.mailDecision }),
        ...(patch.questions
          ? {
              questions: patch.questions.map((question, index) => ({
                id: question.id ?? `q-new-${index + 1}`,
                label: question.label,
                required: question.required,
              })),
            }
          : {}),
        on: patch.on ?? settings.on,
        signOffs: patch.signOffs ?? settings.signOffs,
        watchlist: [
          ...settings.watchlist.filter((entry) => !patch.removeWatch?.includes(entry.id)),
          ...added,
        ],
      };
      return overview();
    },
  };

  const delay = options.delayMs ?? 0;
  const wrapped = Object.fromEntries(
    (Object.keys(backend) as (keyof VettingBackend)[]).map((method) => [
      method,
      async (...args: unknown[]) => {
        calls.push({ method, args });
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        return (backend[method] as (...input: unknown[]) => Promise<unknown>)(...args);
      },
    ])
  ) as unknown as VettingBackend;

  return { ...wrapped, applicationHandle, requestHandle, calls };
}
