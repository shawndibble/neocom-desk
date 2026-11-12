/**
 * What the vetting pages show, worked out from the wire types (`engine/vetting.ts`). Pure: no
 * React, no i18n calls; wording keys and their figures come back for the component to translate.
 */
import { VETTING_SCOPES, type VettingScope } from '@/auth/vettingScopes';
import {
  VETTING_CHECK_SOURCES,
  type VettingAssessment,
  type VettingCheckId,
  type VettingFlag,
  type VettingMinimumId,
  type VettingMinimums,
  type VettingParty,
  type VettingReview,
  type VettingReviewSummary,
  type VettingSeverity,
  type VettingSource,
  type VettingState,
} from '@/engine/vetting';

export type VettingResult =
  'flags' | 'nothing' | 'incomplete' | 'waiting' | 'declined' | 'withdrawn';
export type VettingTone = 'neutral' | 'warning' | 'danger';

const DECIDED: ReadonlySet<VettingState> = new Set([
  'accepted',
  'rejected',
  'withdrawn',
  'declined',
]);

/** A review nobody has to act on any more: the Decided tab's rows. */
export function isDecided(state: VettingState): boolean {
  return DECIDED.has(state);
}

/**
 * A review's result in words. "Nothing found" is neutral on purpose: a clean read is not proof,
 * so it never gets a success tone.
 */
export function reviewResult(
  row: Pick<VettingReviewSummary, 'state' | 'flags' | 'worst' | 'missing'>
): { result: VettingResult; tone: VettingTone } {
  if (row.state === 'requested') return { result: 'waiting', tone: 'neutral' };
  if (row.state === 'declined') return { result: 'declined', tone: 'warning' };
  if (row.state === 'withdrawn') return { result: 'withdrawn', tone: 'neutral' };
  if (row.flags > 0) {
    return { result: 'flags', tone: row.worst === 'critical' ? 'danger' : 'warning' };
  }
  if (row.missing > 0) return { result: 'incomplete', tone: 'warning' };
  return { result: 'nothing', tone: 'neutral' };
}

/** The caller still owes a sign-off the queue should point at. */
export function needsYours(row: Pick<VettingReviewSummary, 'state' | 'yours'>): boolean {
  return row.yours && row.state === 'open';
}

export interface ResultLineState {
  flags: number;
  checks: number;
  /** Checks that could not run. */
  missing: number;
  severity: VettingSeverity | 'clear';
}

/** The report's one-line answer: flags found, nothing found, and whether it is incomplete. */
export function resultLine(assessment: VettingAssessment): ResultLineState {
  const missing = assessment.checks.filter((check) => check.state === 'missing').length;
  const critical = assessment.flags.some((flag) => flag.severity === 'critical');
  return {
    flags: assessment.flags.length,
    checks: assessment.checks.length,
    missing,
    severity: critical
      ? 'critical'
      : assessment.flags.length > 0 || missing > 0
        ? 'warning'
        : 'clear',
  };
}

/** A party's name, with its corporation's when the report placed it in one it also names. */
export function partyLabel(parties: readonly VettingParty[], id: number): string | null {
  const party = parties.find((candidate) => candidate.id === id);
  if (!party) return null;
  if (party.category !== 'character' || party.corporationId === undefined) return party.name;
  const corporation = parties.find((candidate) => candidate.id === party.corporationId);
  return corporation ? `${party.name}, ${corporation.name}` : party.name;
}

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

export interface FlagFormat {
  isk: (value: number) => string;
  /** A large count in short form ("3.2M"). */
  compact: (value: number) => string;
  party: (id: number) => string;
}

/**
 * The figures a flag's sentence (`vetting.checks.<check>.finding`) is built from. `count` is the
 * plural driver wherever the sentence counts something.
 */
export function flagFindingParams(
  flag: Pick<VettingFlag, 'check' | 'facts'>,
  format: FlagFormat
): Record<string, string | number> {
  const fact = (name: string): number => flag.facts[name] ?? 0;
  switch (flag.check) {
    case 'watchlistIsk':
      return {
        total: format.isk(fact('received') + fact('sent')),
        received: format.isk(fact('received')),
        sent: format.isk(fact('sent')),
        count: fact('rows'),
        party: format.party(fact('partyId')),
      };
    case 'watchlistHistory':
      return { count: fact('stays'), party: format.party(fact('corporationId')) };
    case 'watchlistContacts':
    case 'watchlistMail':
    case 'watchlistContracts':
    case 'undeclaredCharacter':
      return { count: fact('rows'), party: format.party(fact('partyId')) };
    case 'corpHopping':
      return { count: fact('joined') };
    case 'cynoNoCapital':
      return { level: ROMAN[fact('level')] ?? String(fact('level')) };
    case 'thinCharacter':
      return {
        skillPoints: format.compact(fact('skillPoints')),
        count: Math.floor(fact('ageDays') / 365),
      };
  }
}

/**
 * Where each check's rows come from, as the report names it (`vetting.sources.<id>`). A label
 * only: which sources a check needs is the engine's `VETTING_CHECK_SOURCES`.
 */
export type VettingSourceLabel = VettingSource | 'history' | 'walletRecent' | 'walletContracts';

export const CHECK_SOURCE_LABEL: Record<VettingCheckId, VettingSourceLabel> = {
  watchlistIsk: 'walletRecent',
  watchlistHistory: 'history',
  watchlistContacts: 'contact',
  watchlistMail: 'mail',
  watchlistContracts: 'contract',
  undeclaredCharacter: 'walletContracts',
  corpHopping: 'history',
  cynoNoCapital: 'skills',
  thinCharacter: 'skills',
};

/** Evidence rows whose `what` has its own wording; anything else reads as "Other". */
const KNOWN_WHAT: ReadonlySet<string> = new Set([
  'player_donation',
  'player_trading',
  'mail',
  'contact',
  'member',
  'joined',
  'item_exchange',
  'courier',
  'auction',
]);

export function evidenceWhatKey(what: string): string {
  return KNOWN_WHAT.has(what) ? `vetting.what.${what}` : 'vetting.what.other';
}

export interface MissingCheck {
  check: VettingCheckId;
  /** What the check reads that was not shared, in the engine's order. */
  sources: VettingSource[];
  /** Declared characters that did not share it. */
  names: string[];
}

/**
 * Checks that could not run, with who did not share what. A check that still flagged is not one.
 * The sources come from the engine's `VETTING_CHECK_SOURCES`, narrowed to the ones those
 * characters actually left out when the report says which.
 */
export function missingChecks(
  assessment: VettingAssessment,
  characters: readonly { characterId: number; name: string; missing?: readonly VettingSource[] }[]
): MissingCheck[] {
  return assessment.checks.flatMap((check) => {
    const needs = VETTING_CHECK_SOURCES[check.check];
    if (check.state !== 'missing' || needs.length === 0) return [];
    const who = check.missingFor.flatMap((id) => {
      const character = characters.find((candidate) => candidate.characterId === id);
      return character ? [character] : [];
    });
    const leftOut = needs.filter((source) =>
      who.some((character) => character.missing?.includes(source))
    );
    return [
      {
        check: check.check,
        sources: leftOut.length > 0 ? leftOut : [...needs],
        names: who.map((character) => character.name),
      },
    ];
  });
}

export type SignOffRow =
  /** The caller has not decided and may. */
  | { kind: 'yours' }
  /** Someone decided; what they decided shows once the caller has. */
  | { kind: 'hidden'; name: string; at: number }
  | {
      kind: 'decided';
      name: string;
      you: boolean;
      at: number;
      decision: 'yes' | 'no';
      note: string;
    }
  /** Asked for the review, so cannot sign it off. `you` when that is the caller. */
  | { kind: 'barred'; name: string; you: boolean };

/**
 * Who has to decide and where each stands, as the caller may see it: recorded sign-offs first
 * (hidden ones without their decision), then the caller's own open row, then whoever is barred.
 */
export function signOffRows(
  review: Pick<VettingReview, 'state' | 'yours' | 'requestedBy' | 'signOffs'>,
  reviewerId: number
): SignOffRow[] {
  const rows: SignOffRow[] = review.signOffs.map((signOff) =>
    signOff.decision === undefined
      ? { kind: 'hidden', name: signOff.name, at: signOff.at }
      : {
          kind: 'decided',
          name: signOff.name,
          you: signOff.you,
          at: signOff.at,
          decision: signOff.decision,
          note: signOff.note ?? '',
        }
  );
  if (review.state !== 'open') return rows;
  if (review.yours) rows.push({ kind: 'yours' });
  if (review.requestedBy) {
    rows.push({
      kind: 'barred',
      name: review.requestedBy.name,
      you: askedByReviewer(review, reviewerId),
    });
  }
  return rows;
}

/** The caller is whoever asked for this review (and so cannot sign it off). */
export function askedByReviewer(
  review: Pick<VettingReview, 'requestedBy'>,
  reviewerId: number
): boolean {
  return review.requestedBy?.characterId === reviewerId;
}

const SCOPE_SOURCE: Record<VettingScope, VettingSource> = {
  'esi-wallet.read_character_wallet.v1': 'wallet',
  'esi-characters.read_contacts.v1': 'contact',
  'esi-mail.read_mail.v1': 'mail',
  'esi-contracts.read_character_contracts.v1': 'contract',
  'esi-skills.read_skills.v1': 'skills',
};

/**
 * The sources a sign-in holding `scopes` could not share: what a device Character's own grant
 * leaves out of a report, so the page can ask for a vetting sign-in before reading it.
 */
export function missingSourcesFor(scopes: readonly string[]): VettingSource[] {
  return VETTING_SCOPES.filter((scope) => !scopes.includes(scope)).map(
    (scope) => SCOPE_SOURCE[scope]
  );
}

/** The minimums a corp set above "none", in the order the apply page lists them. */
export function askedMinimums(
  minimums: VettingMinimums
): { id: VettingMinimumId; value: number }[] {
  return [
    ...(minimums.ageDays > 0 ? [{ id: 'ageDays' as const, value: minimums.ageDays }] : []),
    ...(minimums.skillPoints > 0
      ? [{ id: 'skillPoints' as const, value: minimums.skillPoints }]
      : []),
    ...(minimums.characters > 1 ? [{ id: 'characters' as const, value: minimums.characters }] : []),
  ];
}

/** Every minimum a corp can set, in the order the pages list them. */
export const VETTING_MINIMUM_IDS: readonly VettingMinimumId[] = [
  'ageDays',
  'skillPoints',
  'characters',
];

/**
 * The minimums a `below-minimum` refusal names: the server lists the unmet ids in its message,
 * comma separated. Anything else in there is ignored.
 */
export function unmetFromRefusal(error: unknown): VettingMinimumId[] {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return [];
  const named = message.split(/[^A-Za-z]+/);
  return VETTING_MINIMUM_IDS.filter((id) => named.includes(id));
}

/** What stands between the applicant and Send, first thing first; null when Send is live. */
export type SendBlock = 'characters' | 'reading' | 'minimums' | 'answers' | 'tick';

export function sendBlock(input: {
  characters: number;
  allMine: boolean;
  reading: boolean;
  /** Minimums the corp set that the draft does not meet. */
  unmet?: number;
  /** Required questions left blank. */
  unanswered?: number;
}): SendBlock | null {
  if (input.characters === 0) return 'characters';
  if (input.reading) return 'reading';
  if ((input.unmet ?? 0) > 0) return 'minimums';
  if ((input.unanswered ?? 0) > 0) return 'answers';
  return input.allMine ? null : 'tick';
}

/** Whether the applicant's Send is live. */
export function canSend(input: Parameters<typeof sendBlock>[0]): boolean {
  return sendBlock(input) === null;
}

/**
 * Refusals the vetting callables name in `details.reason` (functions/src/vettingStore.ts,
 * vettingDecide.ts, vettingEsi.ts) that have their own wording.
 */
const KNOWN_REASONS: ReadonlySet<string> = new Set([
  'not-found',
  'bad-key',
  'unknown-corp',
  'vetting-off',
  'wrong-state',
  'rate-limited',
  'too-many-characters',
  'no-characters',
  'pilot-missing',
  'changed',
  'not-a-reviewer',
  'role-required',
  'unknown-name',
  'not-a-member',
  'already-requested',
  'watchlist-full',
  'invite-required',
  'invites-full',
  'answers-required',
  'below-minimum',
  'not-open',
  'barred',
  'own-review',
  'already-signed',
  'esi-backoff',
  'esi-error',
  'esi-forbidden',
]);

/**
 * The pilot's review is gone: deleted, withdrawn, or never there. The server gives one answer
 * for "no such review" and "wrong key" (`bad-key`), so a key cannot be probed for.
 */
export function isReviewGone(reason: string | null): boolean {
  return reason === 'bad-key' || reason === 'not-found';
}

export function vettingErrorKey(reason: string | null): string {
  return reason !== null && KNOWN_REASONS.has(reason)
    ? `vetting.errors.${reason}`
    : 'vetting.errors.generic';
}
