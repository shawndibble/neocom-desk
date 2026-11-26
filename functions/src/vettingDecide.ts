import { isFiniteNumber, isPlainRecord } from './guards.js';
import {
  VETTING_DRAFT_HOURS,
  VETTING_INVITES_MAX,
  VETTING_KEEP_DAYS,
  VETTING_OPEN_KEEP_DAYS,
  VETTING_WATCHLIST_MAX,
  normalizeVettingSettings,
  unmetVettingMinimums,
  type VettingAssessment,
  type VettingCharacterInput,
  type VettingInvite,
  type VettingKind,
  type VettingLogEntry,
  type VettingQuestion,
  type VettingReportCharacter,
  type VettingReview,
  type VettingReviewSummary,
  type VettingSettings,
  type VettingSeverity,
  type VettingSignOffView,
  type VettingStatus,
  type VettingWatchEntry,
  VETTING_MAIL_COOLDOWN_MS,
} from './vettingEngine.js';
import type { VettingSettingsPatch } from './vettingParse.js';
import {
  VETTING_DAILY_DRAFTS,
  VETTING_LOG_MAX,
  VETTING_NOTIFY_MAX,
  VETTING_REQUEST_KEEP_DAYS,
  VETTING_REVIEWER_DAYS,
  type StoredSignOff,
  type StoredVettingReview,
  type StoredVettingReviewers,
  type StoredVettingSettings,
  type VettingActor,
} from './vettingTypes.js';
import { DAY_MS, HOUR_MS } from './timeConstants.js';

const WATCH_CATEGORIES = ['character', 'corporation', 'alliance'];

function readInvites(raw: unknown): VettingInvite[] {
  return (Array.isArray(raw) ? (raw as unknown[]) : []).flatMap((entry): VettingInvite[] => {
    if (!isPlainRecord(entry) || !isPlainRecord(entry.createdBy)) return [];
    const { code, label, createdBy, createdAt, uses } = entry;
    if (typeof code !== 'string' || !code || typeof label !== 'string') return [];
    if (!isFiniteNumber(createdBy.characterId) || typeof createdBy.name !== 'string') return [];
    if (!isFiniteNumber(createdAt) || !isFiniteNumber(uses)) return [];
    return [
      {
        code,
        label,
        createdBy: { characterId: createdBy.characterId, name: createdBy.name },
        createdAt,
        uses,
      },
    ];
  });
}

export function readVettingSettings(data: unknown): StoredVettingSettings {
  const d = isPlainRecord(data) ? data : {};
  const watchlist = (Array.isArray(d.watchlist) ? (d.watchlist as unknown[]) : []).flatMap(
    (entry): VettingWatchEntry[] =>
      isPlainRecord(entry) &&
      isFiniteNumber(entry.id) &&
      typeof entry.name === 'string' &&
      WATCH_CATEGORIES.includes(entry.category as string)
        ? [
            {
              id: entry.id,
              name: entry.name,
              category: entry.category as VettingWatchEntry['category'],
            },
          ]
        : []
  );
  return {
    ...normalizeVettingSettings(d),
    watchlist,
    invites: readInvites(d.invites),
    ...(typeof d.corporationName === 'string' ? { corporationName: d.corporationName } : {}),
    ...(typeof d.corporationTicker === 'string' ? { corporationTicker: d.corporationTicker } : {}),
  };
}

export function wireSettings(settings: StoredVettingSettings): VettingSettings {
  return { ...normalizeVettingSettings(settings), watchlist: settings.watchlist };
}

export function unknownWatchName(
  names: readonly string[],
  resolved: readonly VettingWatchEntry[]
): string | undefined {
  const known = new Set(resolved.map((entry) => entry.name.toLowerCase()));
  return names.find((name) => !known.has(name.toLowerCase()));
}

function patchedQuestions(
  held: readonly VettingQuestion[],
  sent: NonNullable<VettingSettingsPatch['questions']>,
  newId: () => string
): VettingQuestion[] {
  const known = new Set(held.map((question) => question.id));
  const used = new Set<string>();
  return sent.map((entry) => {
    let id = entry.id !== undefined && known.has(entry.id) && !used.has(entry.id) ? entry.id : '';
    while (!id || used.has(id)) id = newId();
    used.add(id);
    return { id, label: entry.label, required: entry.required };
  });
}

export function applyVettingSettingsPatch(
  settings: StoredVettingSettings,
  patch: VettingSettingsPatch,
  added: readonly VettingWatchEntry[],
  newId: () => string
): { ok: true; settings: StoredVettingSettings } | { ok: false; reason: 'watchlist-full' } {
  const removed = new Set(patch.removeWatch);
  const watchlist = settings.watchlist.filter((entry) => !removed.has(entry.id));
  for (const entry of added) {
    if (!watchlist.some((held) => held.id === entry.id)) watchlist.push(entry);
  }
  if (watchlist.length > VETTING_WATCHLIST_MAX) return { ok: false, reason: 'watchlist-full' };
  const next = normalizeVettingSettings({
    on: patch.on ?? settings.on,
    signOffs: patch.signOffs ?? settings.signOffs,
    welcome: patch.welcome ?? settings.welcome,
    contact: patch.contact ?? settings.contact,
    questions: patch.questions
      ? patchedQuestions(settings.questions, patch.questions, newId)
      : settings.questions,
    minimums: patch.minimums ?? settings.minimums,
    rejection: patch.rejection ?? settings.rejection,
    inviteOnly: patch.inviteOnly ?? settings.inviteOnly,
    notifyReviewers: patch.notifyReviewers ?? settings.notifyReviewers,
    mailDecision: patch.mailDecision ?? settings.mailDecision,
  });
  return { ok: true, settings: { ...settings, ...next, watchlist } };
}

export function liveVettingInvite(
  settings: StoredVettingSettings,
  code: string | undefined
): VettingInvite | undefined {
  return code === undefined ? undefined : settings.invites.find((held) => held.code === code);
}

export function vettingInviteOk(
  settings: StoredVettingSettings,
  code: string | undefined
): boolean {
  return !settings.inviteOnly || liveVettingInvite(settings, code) !== undefined;
}

export function addVettingInvite(
  settings: StoredVettingSettings,
  invite: VettingInvite
): { ok: true; settings: StoredVettingSettings } | { ok: false; reason: 'invites-full' } {
  if (settings.invites.length >= VETTING_INVITES_MAX) return { ok: false, reason: 'invites-full' };
  return { ok: true, settings: { ...settings, invites: [...settings.invites, invite] } };
}

export function withoutVettingInvite(
  settings: StoredVettingSettings,
  code: string
): StoredVettingSettings {
  return { ...settings, invites: settings.invites.filter((held) => held.code !== code) };
}

export function withVettingInviteUsed(
  settings: StoredVettingSettings,
  code: string
): StoredVettingSettings {
  return {
    ...settings,
    invites: settings.invites.map((held) =>
      held.code === code ? { ...held, uses: held.uses + 1 } : held
    ),
  };
}

function readReviewers(data: unknown): StoredVettingReviewers['reviewers'] {
  const raw = isPlainRecord(data) && isPlainRecord(data.reviewers) ? data.reviewers : {};
  const out: StoredVettingReviewers['reviewers'] = {};
  for (const [uid, entry] of Object.entries(raw)) {
    if (
      isPlainRecord(entry) &&
      isFiniteNumber(entry.characterId) &&
      isFiniteNumber(entry.lastSeenAt)
    ) {
      out[uid] = {
        characterId: entry.characterId,
        ...(typeof entry.ownerHash === 'string' && entry.ownerHash
          ? { ownerHash: entry.ownerHash }
          : {}),
        lastSeenAt: entry.lastSeenAt,
      };
    }
  }
  return out;
}

const reviewerSeenRecently = (lastSeenAt: number, now: number): boolean =>
  now - lastSeenAt < VETTING_REVIEWER_DAYS * DAY_MS;

export function seenVettingReviewer(
  data: unknown,
  seen: Pick<VettingActor, 'uid' | 'characterId' | 'ownerHash'>,
  now: number
): StoredVettingReviewers | null {
  const { uid, characterId, ownerHash } = seen;
  const held = readReviewers(data);
  const mine = held[uid];
  if (
    mine &&
    mine.characterId === characterId &&
    mine.ownerHash === ownerHash &&
    now >= mine.lastSeenAt
  ) {
    if (now - mine.lastSeenAt < DAY_MS) return null;
  }
  const reviewers: StoredVettingReviewers['reviewers'] = {};
  for (const [id, entry] of Object.entries(held)) {
    if (reviewerSeenRecently(entry.lastSeenAt, now)) reviewers[id] = entry;
  }
  reviewers[uid] = { characterId, ownerHash, lastSeenAt: now };
  return { reviewers };
}

export function vettingSharedRecipients(
  data: unknown,
  review: StoredVettingReview,
  now: number
): number[] {
  const told = Object.values(readReviewers(data))
    .filter((entry) => reviewerSeenRecently(entry.lastSeenAt, now) && !isSubject(review, entry))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt || a.characterId - b.characterId);
  return [...new Set(told.map((entry) => entry.characterId))].slice(0, VETTING_NOTIFY_MAX);
}

export function appendVettingLog(
  log: readonly VettingLogEntry[],
  entry: VettingLogEntry
): VettingLogEntry[] {
  return [...log, entry].slice(-VETTING_LOG_MAX);
}

export function shouldLogOpen(
  log: readonly VettingLogEntry[],
  characterId: number,
  now: number
): boolean {
  return !log.some(
    (entry) =>
      entry.action === 'opened' && entry.characterId === characterId && now - entry.at < HOUR_MS
  );
}

const DECIDED = ['accepted', 'rejected'];

export function isSubject(
  review: StoredVettingReview,
  person: { characterId: number; ownerHash?: string }
): boolean {
  return (
    review.pilot.characterId === person.characterId ||
    review.reportCharacters.some((character) => character.characterId === person.characterId) ||
    review.characters.some(
      (character) =>
        character.characterId === person.characterId ||
        (character.ownerHash !== undefined && character.ownerHash === person.ownerHash)
    )
  );
}

export function isBarred(review: StoredVettingReview, reviewer: VettingActor): boolean {
  const asked = review.requestedBy;
  if (
    asked &&
    (asked.ownerHash === reviewer.ownerHash || asked.characterId === reviewer.characterId)
  ) {
    return true;
  }
  return isSubject(review, reviewer);
}

function hasSigned(review: StoredVettingReview, reviewer: VettingActor): boolean {
  return review.signOffs.some(
    (signOff) =>
      signOff.ownerHash === reviewer.ownerHash || signOff.characterId === reviewer.characterId
  );
}

export type SignOffRefusal = 'not-open' | 'barred' | 'already-signed';

export function decideSignOff(
  review: StoredVettingReview,
  reviewer: VettingActor,
  sign: { decision: 'yes' | 'no'; note: string; reasonShown: boolean },
  now: number
): { ok: true; review: StoredVettingReview } | { ok: false; reason: SignOffRefusal } {
  if (review.state !== 'open') return { ok: false, reason: 'not-open' };
  if (isBarred(review, reviewer)) return { ok: false, reason: 'barred' };
  if (hasSigned(review, reviewer)) return { ok: false, reason: 'already-signed' };

  const signOffs: StoredSignOff[] = [
    ...review.signOffs,
    {
      ...reviewer,
      at: now,
      decision: sign.decision,
      note: sign.note,
      reasonShown: sign.reasonShown,
    },
  ];
  const state =
    signOffs.length < review.signOffsNeeded
      ? 'open'
      : signOffs.some((signOff) => signOff.decision === 'no')
        ? 'rejected'
        : 'accepted';
  const next: StoredVettingReview = {
    ...review,
    signOffs,
    state,
    log: appendVettingLog(review.log, {
      at: now,
      characterId: reviewer.characterId,
      name: reviewer.name,
      action: 'decided',
    }),
  };
  if (state !== 'open') {
    next.decidedAt = now;
    next.deleteAt = now + VETTING_KEEP_DAYS * DAY_MS;
    next.expiresAt = next.deleteAt;
  }
  return { ok: true, review: next };
}

function worstOf(assessment: VettingAssessment | null): VettingSeverity | undefined {
  if (!assessment || assessment.flags.length === 0) return undefined;
  return assessment.flags.some((flag) => flag.severity === 'critical') ? 'critical' : 'warning';
}

export function reviewSummary(
  id: string,
  review: StoredVettingReview,
  viewer: VettingActor
): VettingReviewSummary {
  const worst = worstOf(review.assessment);
  return {
    id,
    kind: review.kind,
    ...(review.role ? { role: review.role } : {}),
    state: review.state,
    pilot: {
      characterId: review.pilot.characterId,
      name: review.pilot.name,
      corporationName: review.pilot.corporationName,
    },
    characters: review.characters.length,
    flags: review.assessment?.flags.length ?? 0,
    ...(worst ? { worst } : {}),
    missing: review.assessment?.checks.filter((check) => check.state === 'missing').length ?? 0,
    signed: review.signOffs.length,
    needed: review.signOffsNeeded,
    yours: review.state === 'open' && !isBarred(review, viewer) && !hasSigned(review, viewer),
    readAt: review.readAt,
    createdAt: review.createdAt,
    decidedAt: review.decidedAt,
    ...(review.invite ? { invite: review.invite.label } : {}),
    ...(review.requestedBy
      ? {
          requestedBy: {
            characterId: review.requestedBy.characterId,
            name: review.requestedBy.name,
          },
        }
      : {}),
    ...(review.requestMail ? { requestMail: { sentAt: review.requestMail.sentAt } } : {}),
  };
}

export function recordRequestMail(
  review: StoredVettingReview,
  actor: VettingActor,
  now: number
):
  | { ok: true; review: StoredVettingReview }
  | { ok: false; reason: 'not-requested' | 'not-asker' | 'mail-cooldown' } {
  if (review.state !== 'requested') return { ok: false, reason: 'not-requested' };
  if (
    !review.requestedBy ||
    (review.requestedBy.characterId !== actor.characterId &&
      !(review.requestedBy.ownerHash !== '' && review.requestedBy.ownerHash === actor.ownerHash))
  ) {
    return { ok: false, reason: 'not-asker' };
  }
  if (review.requestMail && now - review.requestMail.sentAt < VETTING_MAIL_COOLDOWN_MS) {
    return { ok: false, reason: 'mail-cooldown' };
  }
  return { ok: true, review: { ...review, requestMail: { sentAt: now } } };
}

export function reviewView(
  id: string,
  review: StoredVettingReview,
  viewer: VettingActor
): VettingReview {
  const revealed = DECIDED.includes(review.state) || hasSigned(review, viewer);
  const signOffs = review.signOffs.map((signOff): VettingSignOffView => {
    const you =
      signOff.ownerHash === viewer.ownerHash || signOff.characterId === viewer.characterId;
    return {
      characterId: signOff.characterId,
      name: signOff.name,
      you,
      at: signOff.at,
      ...(revealed || you
        ? {
            decision: signOff.decision,
            note: signOff.note,
            reasonShown: signOff.reasonShown === true,
          }
        : {}),
    };
  });
  return {
    ...reviewSummary(id, review, viewer),
    corporationId: review.corporationId,
    note: review.note,
    answers: review.answers ?? [],
    barred: isBarred(review, viewer),
    reportCharacters: review.reportCharacters,
    parties: review.parties,
    assessment: review.assessment,
    signOffs,
    log: review.log,
    deleteAt: review.deleteAt,
    ...(review.rawCounts ? { rawCounts: review.rawCounts } : {}),
  };
}

const SHARED = ['open', ...DECIDED];

export function pilotStatus(
  id: string,
  review: StoredVettingReview,
  settings: VettingSettings,
  now: number
): VettingStatus {
  const application = review.kind === 'application';
  return {
    id,
    corporationId: review.corporationId,
    corporationName: review.corporationName,
    corporationTicker: review.corporationTicker,
    kind: review.kind,
    ...(review.role ? { role: review.role } : {}),
    state: review.state,
    ...(review.requestedBy
      ? {
          requestedBy: {
            characterId: review.requestedBy.characterId,
            name: review.requestedBy.name,
          },
        }
      : {}),
    characters: review.characters.map((character) => ({
      characterId: character.characterId,
      name: character.name,
      corporationName: character.corporationName,
      missing: character.missing,
    })),
    note: review.note,
    readAt: review.readAt,
    decidedAt: review.decidedAt,
    deleteAt: review.deleteAt,
    openedBy: review.log
      .filter((entry) => entry.action === 'opened')
      .map((entry) => ({ name: entry.name, at: entry.at }))
      .sort((a, b) => b.at - a.at),
    contact: SHARED.includes(review.state) ? settings.contact : '',
    questions: application ? settings.questions : [],
    answers: review.answers ?? [],
    unmet:
      application && review.state === 'draft'
        ? unmetVettingMinimums(
            settings.minimums,
            review.characters.map((character) => ({
              birthday: character.birthday ?? '',
              skillPoints: character.skillPoints ?? null,
            })),
            now
          )
        : [],
    ...(review.state === 'rejected'
      ? {
          rejection: {
            wording: settings.rejection.wording,
            reasons: review.signOffs
              .filter((signOff) => signOff.decision === 'no' && signOff.reasonShown === true)
              .map((signOff) => signOff.note.trim())
              .filter((note) => note !== ''),
          },
        }
      : {}),
  };
}

export function reportCharacter(
  input: VettingCharacterInput,
  corporationName: string
): VettingReportCharacter {
  return {
    characterId: input.characterId,
    name: input.name,
    corporationId: input.corporationId,
    corporationName,
    birthday: input.birthday,
    skillPoints: input.skillPoints,
    corporations: new Set(input.history.map((stay) => stay.corporationId)).size,
    missing: input.missing,
  };
}

export function referencedPartyIds(assessment: VettingAssessment): number[] {
  const ids = new Set<number>();
  for (const flag of assessment.flags) {
    for (const row of flag.evidence) ids.add(row.partyId);
    for (const key of ['partyId', 'corporationId']) {
      const id = flag.facts[key];
      if (isFiniteNumber(id) && id > 0) ids.add(id);
    }
  }
  return [...ids];
}

export function withoutCharacter(
  review: StoredVettingReview,
  characterId: number
): StoredVettingReview {
  const characters = review.characters.filter((c) => c.characterId !== characterId);
  const next: StoredVettingReview = { ...review, characters };
  const first = characters[0];
  if (review.kind === 'application' && review.pilot.characterId === characterId && first) {
    next.pilot = {
      characterId: first.characterId,
      name: first.name,
      corporationName: first.corporationName,
    };
  }
  if (review.state === 'requested' && characters.length === 0) {
    next.expiresAt = requestExpiry(review.createdAt);
  }
  return next;
}

export const draftExpiry = (now: number): number => now + VETTING_DRAFT_HOURS * HOUR_MS;
export const requestExpiry = (createdAt: number): number =>
  createdAt + VETTING_REQUEST_KEEP_DAYS * DAY_MS;
export const openExpiry = (now: number): number => now + VETTING_OPEN_KEEP_DAYS * DAY_MS;

const expired = (review: Partial<StoredVettingReview>, now: number): boolean =>
  isFiniteNumber(review.expiresAt) && review.expiresAt <= now;

export function isExpiredDraft(review: Partial<StoredVettingReview>, now: number): boolean {
  return review.state === 'draft' && expired(review, now);
}

export function hasExpiredInputs(review: Partial<StoredVettingReview>, now: number): boolean {
  return (
    review.state === 'requested' && (review.characters?.length ?? 0) > 0 && expired(review, now)
  );
}

export function withoutInputs(review: StoredVettingReview): StoredVettingReview {
  return { ...review, characters: [], expiresAt: requestExpiry(review.createdAt) };
}

export function decideVettingSweep(
  review: Partial<StoredVettingReview>,
  now: number
): 'delete' | 'clear-inputs' | 'keep' {
  if (!expired(review, now)) return 'keep';
  if (review.state === 'requested') {
    if (isFiniteNumber(review.createdAt) && now < requestExpiry(review.createdAt)) {
      return hasExpiredInputs(review, now) ? 'clear-inputs' : 'keep';
    }
  }
  return 'delete';
}

export interface DraftThrottle {
  windowStart: number;
  count: number;
}

export function nextDraftSlot(
  state: DraftThrottle | undefined,
  now: number
): { allowed: boolean; state: DraftThrottle } {
  if (!state || !isFiniteNumber(state.windowStart) || now - state.windowStart >= DAY_MS) {
    return { allowed: true, state: { windowStart: now, count: 1 } };
  }
  if (state.count >= VETTING_DAILY_DRAFTS) return { allowed: false, state };
  return { allowed: true, state: { windowStart: state.windowStart, count: state.count + 1 } };
}

export function signOffsNeeded(settings: VettingSettings, kind: VettingKind): number {
  return settings.signOffs[kind];
}

export interface TimedEntry<T> {
  at: number;
  value: T;
}

export function recallTimed<K, T>(
  cache: Map<K, TimedEntry<T>>,
  key: K,
  now: number,
  ttlMs: number
): TimedEntry<T> | undefined {
  const held = cache.get(key);
  return held && now >= held.at && now - held.at < ttlMs ? held : undefined;
}

export function rememberTimed<K, T>(
  cache: Map<K, TimedEntry<T>>,
  key: K,
  value: T,
  now: number,
  max: number
): void {
  cache.delete(key);
  for (const oldest of cache.keys()) {
    if (cache.size < max) break;
    cache.delete(oldest);
  }
  cache.set(key, { at: now, value });
}
