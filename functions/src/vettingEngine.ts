import { DAY_MS } from './timeConstants.js';

export type VettingSource = 'wallet' | 'contact' | 'mail' | 'contract' | 'skills';

export const VETTING_CHECKS = [
  'watchlistIsk',
  'watchlistHistory',
  'watchlistContacts',
  'watchlistMail',
  'watchlistContracts',
  'undeclaredCharacter',
  'corpHopping',
  'cynoNoCapital',
  'thinCharacter',
] as const;

export type VettingCheckId = (typeof VETTING_CHECKS)[number];
export type VettingSeverity = 'critical' | 'warning';

export interface VettingParty {
  id: number;
  name: string;
  category: 'character' | 'corporation' | 'alliance' | 'other';
  corporationId?: number;
  allianceId?: number;
}

export interface VettingDealing {
  source: Exclude<VettingSource, 'skills'>;
  at: string | null;
  partyId: number;
  what: string;
  amount?: number;
  standing?: number;
}

export interface VettingCharacterInput {
  characterId: number;
  name: string;
  corporationId: number;
  birthday: string;
  skillPoints: number | null;
  history: { corporationId: number; startDate: string }[];
  dealings: VettingDealing[];
  skills: { id: number; level: number }[];
  missing: VettingSource[];
}

export interface VettingInput {
  now: number;
  characters: VettingCharacterInput[];
  parties: VettingParty[];
  watchlist: number[];
}

export interface VettingEvidence {
  characterId: number;
  at: string | null;
  partyId: number;
  what: string;
  amount?: number;
}

export interface VettingFlag {
  check: VettingCheckId;
  severity: VettingSeverity;
  characterIds: number[];
  facts: Record<string, number>;
  evidence: VettingEvidence[];
  evidenceTotal: number;
}

export interface VettingCheckResult {
  check: VettingCheckId;
  state: 'flag' | 'clear' | 'missing';
  missingFor: number[];
}

export interface VettingAssessment {
  flags: VettingFlag[];
  checks: VettingCheckResult[];
}

export const VETTING_EVIDENCE_CAP = 10;
export const VETTING_SERIOUS_ISK = 100_000_000;
export const VETTING_RECENT_DAYS = 180;
export const VETTING_HOP_JOINS = 4;
export const VETTING_UNDECLARED_ROWS = 5;
export const VETTING_THIN_AGE_DAYS = 3 * 365;
export const VETTING_THIN_SKILL_POINTS = 5_000_000;

const CYNO_SKILL = 21603;
const CAPITAL_SKILLS = [
  24311, 24312, 24313, 24314, 20525, 20530, 20531, 20532, 52997, 3344, 3345, 3346, 3347, 20533,
  28656,
];
const PERSONAL_REF_TYPES = ['player_donation', 'player_trading'];

export const VETTING_CHECK_SOURCES: Record<VettingCheckId, readonly VettingSource[]> = {
  watchlistIsk: ['wallet'],
  watchlistHistory: [],
  watchlistContacts: ['contact'],
  watchlistMail: ['mail'],
  watchlistContracts: ['contract'],
  undeclaredCharacter: ['wallet', 'contract'],
  corpHopping: [],
  cynoNoCapital: ['skills'],
  thinCharacter: ['skills'],
};

function isNpcCorporation(id: number): boolean {
  return id >= 1_000_000 && id < 2_000_000;
}

interface Row extends VettingEvidence {
  source: VettingDealing['source'];
  standing?: number;
}

function newestFirst(a: VettingEvidence, b: VettingEvidence): number {
  return (b.at ?? '').localeCompare(a.at ?? '');
}

function flag(
  check: VettingCheckId,
  severity: VettingSeverity,
  rows: VettingEvidence[],
  facts: Record<string, number>,
  characterIds?: number[]
): VettingFlag {
  const sorted = [...rows].sort(newestFirst);
  const ids =
    characterIds ?? [...new Set(rows.map((row) => row.characterId))].sort((a, b) => a - b);
  return {
    check,
    severity,
    characterIds: ids,
    facts,
    evidence: sorted.slice(0, VETTING_EVIDENCE_CAP).map((row) => {
      const evidence: VettingEvidence = {
        characterId: row.characterId,
        at: row.at,
        partyId: row.partyId,
        what: row.what,
      };
      if (row.amount !== undefined) evidence.amount = row.amount;
      return evidence;
    }),
    evidenceTotal: rows.length,
  };
}

function leadParty(rows: VettingEvidence[]): number {
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.partyId, (counts.get(row.partyId) ?? 0) + 1);
  let lead = rows[0]?.partyId ?? 0;
  let most = 0;
  for (const [id, count] of counts) {
    if (count > most) {
      lead = id;
      most = count;
    }
  }
  return lead;
}

export function assessVetting(input: VettingInput): VettingAssessment {
  const watch = new Set(input.watchlist);
  const parties = new Map(input.parties.map((party) => [party.id, party]));
  const declared = new Set(input.characters.map((character) => character.characterId));
  const watched = (partyId: number): boolean => {
    if (watch.has(partyId)) return true;
    const party = parties.get(partyId);
    if (!party) return false;
    return (
      (party.corporationId !== undefined && watch.has(party.corporationId)) ||
      (party.allianceId !== undefined && watch.has(party.allianceId))
    );
  };

  const rows: Row[] = input.characters.flatMap((character) =>
    character.dealings.map((dealing) => ({ ...dealing, characterId: character.characterId }))
  );
  const flags: VettingFlag[] = [];

  const isk = rows.filter((row) => row.source === 'wallet' && watched(row.partyId));
  if (isk.length > 0) {
    let received = 0;
    let sent = 0;
    for (const row of isk) {
      const amount = row.amount ?? 0;
      if (amount >= 0) received += amount;
      else sent -= amount;
    }
    flags.push(
      flag('watchlistIsk', received + sent >= VETTING_SERIOUS_ISK ? 'critical' : 'warning', isk, {
        received,
        sent,
        rows: isk.length,
        partyId: leadParty(isk),
      })
    );
  }

  const stays: VettingEvidence[] = [];
  let recentStay = false;
  for (const character of input.characters) {
    character.history.forEach((stay, index) => {
      if (!watch.has(stay.corporationId)) return;
      const left = character.history[index - 1]?.startDate;
      const leftAt = left ? Date.parse(left) : input.now;
      if (input.now - leftAt <= VETTING_RECENT_DAYS * DAY_MS) recentStay = true;
      stays.push({
        characterId: character.characterId,
        at: stay.startDate,
        partyId: stay.corporationId,
        what: 'member',
      });
    });
  }
  if (stays.length > 0) {
    flags.push(
      flag('watchlistHistory', recentStay ? 'critical' : 'warning', stays, {
        corporationId: [...stays].sort(newestFirst)[0]?.partyId ?? 0,
        stays: stays.length,
      })
    );
  }

  const simple: [VettingCheckId, (row: Row) => boolean][] = [
    ['watchlistContacts', (row) => row.source === 'contact' && (row.standing ?? 0) > 0],
    ['watchlistMail', (row) => row.source === 'mail'],
    ['watchlistContracts', (row) => row.source === 'contract'],
  ];
  for (const [check, matches] of simple) {
    const found = rows.filter((row) => matches(row) && watched(row.partyId));
    if (found.length > 0) {
      flags.push(flag(check, 'warning', found, { rows: found.length, partyId: leadParty(found) }));
    }
  }

  const personal = rows.filter(
    (row) =>
      !declared.has(row.partyId) &&
      parties.get(row.partyId)?.category === 'character' &&
      (row.source === 'contract' ||
        (row.source === 'wallet' && PERSONAL_REF_TYPES.includes(row.what)))
  );
  const byParty = new Map<number, Row[]>();
  for (const row of personal) byParty.set(row.partyId, [...(byParty.get(row.partyId) ?? []), row]);
  const repeat = [...byParty.entries()]
    .filter(([, found]) => found.length >= VETTING_UNDECLARED_ROWS)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [partyId, found] of repeat) {
    flags.push(flag('undeclaredCharacter', 'warning', found, { partyId, rows: found.length }));
  }

  for (const character of input.characters) {
    const joined = character.history.filter(
      (stay) =>
        !isNpcCorporation(stay.corporationId) &&
        input.now - Date.parse(stay.startDate) <= 365 * DAY_MS
    );
    if (joined.length >= VETTING_HOP_JOINS) {
      flags.push(
        flag(
          'corpHopping',
          'warning',
          joined.map((stay) => ({
            characterId: character.characterId,
            at: stay.startDate,
            partyId: stay.corporationId,
            what: 'joined',
          })),
          { joined: joined.length }
        )
      );
    }
  }

  const skilled = input.characters.filter((character) => !character.missing.includes('skills'));
  const hasCapital = skilled.some((character) =>
    character.skills.some((skill) => CAPITAL_SKILLS.includes(skill.id) && skill.level > 0)
  );
  if (!hasCapital) {
    for (const character of skilled) {
      const cyno = character.skills.find((skill) => skill.id === CYNO_SKILL && skill.level > 0);
      if (cyno) {
        flags.push(
          flag('cynoNoCapital', 'warning', [], { level: cyno.level }, [character.characterId])
        );
      }
    }
  }

  for (const character of skilled) {
    const ageDays = (input.now - Date.parse(character.birthday)) / DAY_MS;
    if (
      character.skillPoints !== null &&
      ageDays >= VETTING_THIN_AGE_DAYS &&
      character.skillPoints < VETTING_THIN_SKILL_POINTS
    ) {
      flags.push(
        flag(
          'thinCharacter',
          'warning',
          [],
          { skillPoints: character.skillPoints, ageDays: Math.floor(ageDays) },
          [character.characterId]
        )
      );
    }
  }

  flags.sort(
    (a, b) =>
      Number(b.severity === 'critical') - Number(a.severity === 'critical') ||
      VETTING_CHECKS.indexOf(a.check) - VETTING_CHECKS.indexOf(b.check)
  );

  const checks = VETTING_CHECKS.map((check): VettingCheckResult => {
    const sources = VETTING_CHECK_SOURCES[check];
    const missingFor = input.characters
      .filter((character) => sources.some((source) => character.missing.includes(source)))
      .map((character) => character.characterId);
    const flagged = flags.some((found) => found.check === check);
    return {
      check,
      state: flagged ? 'flag' : missingFor.length > 0 ? 'missing' : 'clear',
      missingFor,
    };
  });

  return { flags, checks };
}

export type VettingKind = 'application' | 'promotion';

export type VettingState =
  'draft' | 'requested' | 'open' | 'accepted' | 'rejected' | 'withdrawn' | 'declined';

export interface VettingWatchEntry {
  id: number;
  name: string;
  category: 'character' | 'corporation' | 'alliance';
}

export interface VettingQuestion {
  id: string;
  label: string;
  required: boolean;
}

export interface VettingAnswer {
  questionId: string;
  label: string;
  answer: string;
}

export interface VettingMinimums {
  ageDays: number;
  skillPoints: number;
  characters: number;
}

export interface VettingRejection {
  wording: 'rejected' | 'notNow';
  showReason: boolean;
}

export interface VettingInvite {
  code: string;
  label: string;
  createdBy: { characterId: number; name: string };
  createdAt: number;
  uses: number;
}

export interface VettingSettings {
  on: boolean;
  watchlist: VettingWatchEntry[];
  signOffs: Record<VettingKind, number>;
  welcome: string;
  contact: string;
  questions: VettingQuestion[];
  minimums: VettingMinimums;
  rejection: VettingRejection;
  inviteOnly: boolean;
  notifyReviewers: boolean;
  mailDecision: boolean;
}

export const VETTING_DEFAULT_SETTINGS: VettingSettings = {
  on: false,
  watchlist: [],
  signOffs: { application: 1, promotion: 2 },
  welcome: '',
  contact: '',
  questions: [],
  minimums: { ageDays: 0, skillPoints: 0, characters: 1 },
  rejection: { wording: 'rejected', showReason: false },
  inviteOnly: false,
  notifyReviewers: true,
  mailDecision: true,
};

export const VETTING_WELCOME_MAX = 600;
export const VETTING_CONTACT_MAX = 200;
export const VETTING_QUESTIONS_MAX = 8;
export const VETTING_QUESTION_MAX = 120;
export const VETTING_ANSWER_MAX = 500;
export const VETTING_INVITES_MAX = 50;
export const VETTING_INVITE_LABEL_MAX = 40;
export const VETTING_MINIMUM_LIMITS: VettingMinimums = {
  ageDays: 3650,
  skillPoints: 500_000_000,
  characters: 30,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeVettingSettings(raw: unknown): VettingSettings {
  const d = isObject(raw) ? raw : {};
  const base = VETTING_DEFAULT_SETTINGS;
  const signOffs = isObject(d.signOffs) ? d.signOffs : {};
  const minimums = isObject(d.minimums) ? d.minimums : {};
  const rejection = isObject(d.rejection) ? d.rejection : {};
  const seen = new Set<string>();
  const questions: VettingQuestion[] = [];
  for (const entry of Array.isArray(d.questions) ? d.questions : []) {
    if (!isObject(entry) || typeof entry.id !== 'string') continue;
    const label = text(entry.label, VETTING_QUESTION_MAX);
    if (!entry.id || !label || seen.has(entry.id)) continue;
    if (questions.length === VETTING_QUESTIONS_MAX) break;
    seen.add(entry.id);
    questions.push({ id: entry.id, label, required: entry.required === true });
  }
  return {
    on: d.on === true,
    watchlist: Array.isArray(d.watchlist) ? (d.watchlist as VettingWatchEntry[]) : [],
    signOffs: {
      application: clampInt(signOffs.application, 1, 3, base.signOffs.application),
      promotion: clampInt(signOffs.promotion, 1, 3, base.signOffs.promotion),
    },
    welcome: text(d.welcome, VETTING_WELCOME_MAX),
    contact: text(d.contact, VETTING_CONTACT_MAX),
    questions,
    minimums: {
      ageDays: clampInt(minimums.ageDays, 0, VETTING_MINIMUM_LIMITS.ageDays, 0),
      skillPoints: clampInt(minimums.skillPoints, 0, VETTING_MINIMUM_LIMITS.skillPoints, 0),
      characters: clampInt(minimums.characters, 1, VETTING_MINIMUM_LIMITS.characters, 1),
    },
    rejection: {
      wording: rejection.wording === 'notNow' ? 'notNow' : 'rejected',
      showReason: rejection.showReason === true,
    },
    inviteOnly: d.inviteOnly === true,
    notifyReviewers: d.notifyReviewers !== false,
    mailDecision: d.mailDecision !== false,
  };
}

export type VettingMinimumId = keyof VettingMinimums;

export function unmetVettingMinimums(
  minimums: VettingMinimums,
  characters: { birthday: string; skillPoints: number | null }[],
  now: number
): VettingMinimumId[] {
  const unmet: VettingMinimumId[] = [];
  if (
    minimums.ageDays > 0 &&
    !characters.some((c) => now - Date.parse(c.birthday) >= minimums.ageDays * DAY_MS)
  ) {
    unmet.push('ageDays');
  }
  if (
    minimums.skillPoints > 0 &&
    !characters.some((c) => c.skillPoints !== null && c.skillPoints >= minimums.skillPoints)
  ) {
    unmet.push('skillPoints');
  }
  if (characters.length < minimums.characters) unmet.push('characters');
  return unmet;
}

export function settleVettingAnswers(
  questions: VettingQuestion[],
  given: { questionId: string; answer: string }[]
): { answers: VettingAnswer[]; unanswered: string[] } {
  const answers: VettingAnswer[] = [];
  const unanswered: string[] = [];
  for (const question of questions) {
    const found = given.find((entry) => entry.questionId === question.id);
    const answer = text(found?.answer, VETTING_ANSWER_MAX);
    if (answer) answers.push({ questionId: question.id, label: question.label, answer });
    else if (question.required) unanswered.push(question.id);
  }
  return { answers, unanswered };
}

export const VETTING_KEEP_DAYS = 30;
export const VETTING_OPEN_KEEP_DAYS = 90;
export const VETTING_ROLE_MAX = 40;

export const VETTING_MAIL_COOLDOWN_MS = DAY_MS;
export const VETTING_DRAFT_HOURS = 24;
export const VETTING_MAX_CHARACTERS = 30;
export const VETTING_NOTE_MAX = 1000;
export const VETTING_WATCHLIST_MAX = 200;

export interface VettingReportCharacter {
  characterId: number;
  name: string;
  corporationId: number;
  corporationName: string;
  birthday: string;
  skillPoints: number | null;
  corporations: number;
  missing: VettingSource[];
}

export interface VettingLogEntry {
  at: number;
  characterId: number;
  name: string;
  action: 'started' | 'shared' | 'opened' | 'requested' | 'decided' | 'declined' | 'withdrew';
}

export interface VettingSignOffView {
  characterId: number;
  name: string;
  you: boolean;
  at: number;
  decision?: 'yes' | 'no';
  note?: string;
  reasonShown?: boolean;
}

export interface VettingReviewSummary {
  id: string;
  kind: VettingKind;
  role?: string;
  state: VettingState;
  pilot: { characterId: number; name: string; corporationName: string };
  characters: number;
  flags: number;
  worst?: VettingSeverity;
  missing: number;
  signed: number;
  needed: number;
  yours: boolean;
  readAt: number | null;
  createdAt: number;
  decidedAt: number | null;
  invite?: string;
  requestedBy?: { characterId: number; name: string };
  requestMail?: { sentAt: number };
}

export interface VettingReview extends VettingReviewSummary {
  corporationId: number;
  note: string;
  answers: VettingAnswer[];
  barred: boolean;
  reportCharacters: VettingReportCharacter[];
  parties: VettingParty[];
  assessment: VettingAssessment | null;
  signOffs: VettingSignOffView[];
  log: VettingLogEntry[];
  deleteAt: number | null;
  rawCounts?: Record<VettingRawSource, number>;
}

export const VETTING_RAW_SOURCES = [
  'wallet',
  'contact',
  'mail',
  'contract',
  'skills',
  'history',
] as const;
export type VettingRawSource = (typeof VETTING_RAW_SOURCES)[number];

export interface VettingRawRow {
  characterId: number;
  at: string | null;
  what: string;
  partyId?: number;
  amount?: number;
  standing?: number;
  recipients?: number[];
  status?: string;
  skillId?: number;
  level?: number;
  corporationId?: number;
  joined?: string;
  left?: string | null;
}

export interface VettingRawPage {
  reviewId: string;
  source: VettingRawSource;
  rows: VettingRawRow[];
  parties: VettingParty[];
  next: string | null;
}

export interface VettingStatus {
  id: string;
  corporationId: number;
  corporationName: string;
  corporationTicker: string;
  kind: VettingKind;
  role?: string;
  state: VettingState;
  requestedBy?: { characterId: number; name: string };
  characters: {
    characterId: number;
    name: string;
    corporationName: string;
    missing: VettingSource[];
  }[];
  note: string;
  readAt: number | null;
  decidedAt: number | null;
  deleteAt: number | null;
  openedBy: { name: string; at: number }[];
  contact: string;
  questions: VettingQuestion[];
  answers: VettingAnswer[];
  unmet: VettingMinimumId[];
  rejection?: { wording: VettingRejection['wording']; reasons: string[] };
}

export interface VettingCorpInfo {
  corporationId: number;
  name: string;
  ticker: string;
  on: boolean;
  welcome: string;
  minimums: VettingMinimums;
  inviteOnly: boolean;
  inviteOk: boolean;
}

export interface VettingOverview {
  settings: VettingSettings;
  canConfigure: boolean;
  reviews: VettingReviewSummary[];
  invites: VettingInvite[];
}
