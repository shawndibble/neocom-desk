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

export function isDecided(state: VettingState): boolean {
  return DECIDED.has(state);
}

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

export function visibleReviews<T extends Pick<VettingReviewSummary, 'pilot'>>(
  reviews: readonly T[],
  viewerId: number
): T[] {
  return reviews.filter((review) => review.pilot.characterId !== viewerId);
}

export function needsYours(row: Pick<VettingReviewSummary, 'state' | 'yours'>): boolean {
  return row.yours && row.state === 'open';
}

export interface ResultLineState {
  flags: number;
  checks: number;
  missing: number;
  severity: VettingSeverity | 'clear';
}

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
  compact: (value: number) => string;
  party: (id: number) => string;
}

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
  sources: VettingSource[];
  names: string[];
}

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
  | { kind: 'yours' }
  | { kind: 'hidden'; name: string; at: number }
  | {
      kind: 'decided';
      name: string;
      you: boolean;
      at: number;
      decision: 'yes' | 'no';
      note: string;
    }
  | { kind: 'barred'; name: string; you: boolean };

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
  if (review.state !== 'open' && review.state !== 'requested') return rows;
  if (review.state === 'open' && review.yours) rows.push({ kind: 'yours' });
  if (review.requestedBy) {
    rows.push({
      kind: 'barred',
      name: review.requestedBy.name,
      you: askedByReviewer(review, reviewerId),
    });
  }
  return rows;
}

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

export function missingSourcesFor(scopes: ReadonlySet<string>): VettingSource[] {
  return VETTING_SCOPES.filter((scope) => !scopes.has(scope)).map((scope) => SCOPE_SOURCE[scope]);
}

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

export const VETTING_MINIMUM_IDS: readonly VettingMinimumId[] = [
  'ageDays',
  'skillPoints',
  'characters',
];

export function unmetFromRefusal(error: unknown): VettingMinimumId[] {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return [];
  const named = message.split(/[^A-Za-z]+/);
  return VETTING_MINIMUM_IDS.filter((id) => named.includes(id));
}

export type SendBlock = 'characters' | 'reading' | 'minimums' | 'answers' | 'tick';

export function sendBlock(input: {
  characters: number;
  allMine: boolean;
  reading: boolean;
  unmet?: number;
  unanswered?: number;
}): SendBlock | null {
  if (input.characters === 0) return 'characters';
  if (input.reading) return 'reading';
  if ((input.unmet ?? 0) > 0) return 'minimums';
  if ((input.unanswered ?? 0) > 0) return 'answers';
  return input.allMine ? null : 'tick';
}

export function canSend(input: Parameters<typeof sendBlock>[0]): boolean {
  return sendBlock(input) === null;
}

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
  'not-requested',
  'not-asker',
  'mail-cooldown',
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

export function isReviewGone(reason: string | null): boolean {
  return reason === 'bad-key' || reason === 'not-found';
}

export function vettingErrorKey(reason: string | null): string {
  return reason !== null && KNOWN_REASONS.has(reason)
    ? `vetting.errors.${reason}`
    : 'vetting.errors.generic';
}
