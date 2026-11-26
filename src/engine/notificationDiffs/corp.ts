import { diffRoster } from '../corp/members';
import { diffJobReady } from './jobReady';

export interface StructureFuelEntrySnapshot {
  structureId: number;
  name: string;
  fuelExpiresMs: number | null;
  thresholdMs: number;
}

export interface StructureFuelSnapshot {
  entries: readonly StructureFuelEntrySnapshot[];
  nowMs: number;
}

export interface StructureFuelLowFire {
  eventId: 'structureFuelLow';
  characterId: number;
  structureId: number;
  structureName: string;
  thresholdMs: number;
  fuelExpiresMs: number;
}

const SAME_COUNTDOWN_MS = 2 * 3_600_000;

export function diffStructureFuelLow(
  characterId: number,
  prev: StructureFuelSnapshot | undefined,
  next: StructureFuelSnapshot
): StructureFuelLowFire[] {
  if (!prev) return [];
  const prevByStructure = new Map(prev.entries.map((entry) => [entry.structureId, entry]));
  const fires: StructureFuelLowFire[] = [];
  for (const entry of next.entries) {
    if (entry.fuelExpiresMs === null) continue;
    const remainingNow = entry.fuelExpiresMs - next.nowMs;
    if (remainingNow > entry.thresholdMs) continue;
    if (remainingNow <= 0) continue;
    const prevEntry = prevByStructure.get(entry.structureId);
    const observedBefore =
      prevEntry?.fuelExpiresMs != null &&
      Math.abs(prevEntry.fuelExpiresMs - entry.fuelExpiresMs) <= SAME_COUNTDOWN_MS;
    if (observedBefore && prevEntry.fuelExpiresMs !== null) {
      const remainingPrev = prevEntry.fuelExpiresMs - prev.nowMs;
      if (remainingPrev <= prevEntry.thresholdMs) continue;
    }
    fires.push({
      eventId: 'structureFuelLow',
      characterId,
      structureId: entry.structureId,
      structureName: entry.name,
      thresholdMs: entry.thresholdMs,
      fuelExpiresMs: entry.fuelExpiresMs,
    });
  }
  return fires;
}

export interface CorpIndustryJobEntrySnapshot {
  jobId: number;
  endMs: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
}

export interface CorpIndustryJobSnapshot {
  entries: readonly CorpIndustryJobEntrySnapshot[];
  nowMs: number;
}

export interface CorpIndustryJobNotificationFire {
  eventId: 'corpIndustryJobReady';
  characterId: number;
  jobId: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
  endMs: number;
}

export function diffCorpIndustryJobReady(
  characterId: number,
  prev: CorpIndustryJobSnapshot | undefined,
  next: CorpIndustryJobSnapshot
): CorpIndustryJobNotificationFire[] {
  return diffJobReady('corpIndustryJobReady', characterId, prev, next);
}

export interface CorpRosterMemberSnapshot {
  characterId: number;
}

export interface CorpRosterSnapshot {
  entries: readonly CorpRosterMemberSnapshot[];
  nowMs: number;
}

export interface CorpMemberJoinedFire {
  eventId: 'corpMemberJoined';
  characterId: number;
  memberCharacterId: number;
}

export interface CorpMemberLeftFire {
  eventId: 'corpMemberLeft';
  characterId: number;
  memberCharacterId: number;
}

function rosterIds(snapshot: CorpRosterSnapshot | undefined): readonly number[] | undefined {
  return snapshot?.entries.map((entry) => entry.characterId);
}

export function diffCorpMemberJoined(
  characterId: number,
  prev: CorpRosterSnapshot | undefined,
  next: CorpRosterSnapshot
): CorpMemberJoinedFire[] {
  const { joined } = diffRoster(rosterIds(prev), rosterIds(next) ?? []);
  return joined.map((memberCharacterId) => ({
    eventId: 'corpMemberJoined' as const,
    characterId,
    memberCharacterId,
  }));
}

export function diffCorpMemberLeft(
  characterId: number,
  prev: CorpRosterSnapshot | undefined,
  next: CorpRosterSnapshot
): CorpMemberLeftFire[] {
  const { left } = diffRoster(rosterIds(prev), rosterIds(next) ?? []);
  return left.map((memberCharacterId) => ({
    eventId: 'corpMemberLeft' as const,
    characterId,
    memberCharacterId,
  }));
}

export interface CorpWalletJournalEntrySnapshot {
  id: number;
  amount: number | null;
}

export interface CorpWalletDivisionSnapshot {
  division: number;
  balance: number;
  journal: readonly CorpWalletJournalEntrySnapshot[];
  balanceFloorIsk: number;
  transactionCeilingIsk: number;
}

export interface CorpWalletSnapshot {
  divisions: readonly CorpWalletDivisionSnapshot[];
  nowMs: number;
}

export type CorpWalletThresholdFire =
  | {
      eventId: 'corpWalletThreshold';
      characterId: number;
      kind: 'balanceBelow';
      division: number;
      balance: number;
      thresholdIsk: number;
    }
  | {
      eventId: 'corpWalletThreshold';
      characterId: number;
      kind: 'transactionAbove';
      division: number;
      amount: number;
      thresholdIsk: number;
      journalEntryId: number;
    };

export function diffCorpWalletThreshold(
  characterId: number,
  prev: CorpWalletSnapshot | undefined,
  next: CorpWalletSnapshot
): CorpWalletThresholdFire[] {
  if (!prev) return [];
  const prevByDivision = new Map(prev.divisions.map((division) => [division.division, division]));
  const fires: CorpWalletThresholdFire[] = [];
  for (const division of next.divisions) {
    if (division.balance <= division.balanceFloorIsk) {
      const prevDivision = prevByDivision.get(division.division);
      const wasAbove =
        prevDivision === undefined || prevDivision.balance > prevDivision.balanceFloorIsk;
      if (wasAbove) {
        fires.push({
          eventId: 'corpWalletThreshold',
          characterId,
          kind: 'balanceBelow',
          division: division.division,
          balance: division.balance,
          thresholdIsk: division.balanceFloorIsk,
        });
      }
    }

    if (division.journal.length === 0) continue;
    const prevDivision = prevByDivision.get(division.division);
    const maxPrevId = (prevDivision?.journal ?? []).reduce(
      (max, entry) => Math.max(max, entry.id),
      0
    );
    for (const entry of division.journal) {
      if (entry.id <= maxPrevId) continue;
      if (entry.amount === null) continue;
      if (Math.abs(entry.amount) < division.transactionCeilingIsk) continue;
      fires.push({
        eventId: 'corpWalletThreshold',
        characterId,
        kind: 'transactionAbove',
        division: division.division,
        amount: entry.amount,
        thresholdIsk: division.transactionCeilingIsk,
        journalEntryId: entry.id,
      });
    }
  }
  return fires;
}
