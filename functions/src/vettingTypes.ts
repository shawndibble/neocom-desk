import type {
  VettingAnswer,
  VettingCharacterInput,
  VettingAssessment,
  VettingInvite,
  VettingKind,
  VettingLogEntry,
  VettingParty,
  VettingRawRow,
  VettingRawSource,
  VettingReportCharacter,
  VettingSettings,
  VettingSource,
  VettingState,
} from './vettingEngine.js';

export const VETTING_SETTINGS_COLLECTION = 'vetting';
export const VETTING_SETTINGS_DOC = 'settings';
export const VETTING_REVIEWERS_DOC = 'reviewers';
export const VETTING_REVIEWS = 'vettingReviews';
export const VETTING_INPUTS = 'inputs';
export const VETTING_RAW = 'rawRows';
export const VETTING_THROTTLE = 'vettingThrottle';

export const VETTING_COLLECTIONS: readonly string[] = [
  VETTING_SETTINGS_COLLECTION,
  VETTING_REVIEWS,
  VETTING_THROTTLE,
];

export const VETTING_REQUEST_KEEP_DAYS = 30;
export const VETTING_LOG_MAX = 100;
export const VETTING_MAX_READS = 30;
export const VETTING_DAILY_DRAFTS = 10;
export const VETTING_MAX_DEALINGS = 5000;
export const VETTING_WATCH_ADD_MAX = 50;

export const VETTING_REVIEWER_DAYS = 30;
export const VETTING_NOTIFY_MAX = 50;
export const VETTING_NOTIFY_BUDGET_MS = 3000;

export interface StoredVettingSettings extends VettingSettings {
  invites: VettingInvite[];
  corporationName?: string;
  corporationTicker?: string;
}

export interface StoredVettingReviewers {
  reviewers: Record<string, StoredVettingReviewer>;
}

interface StoredVettingReviewer {
  characterId: number;
  ownerHash?: string;
  lastSeenAt: number;
}

export interface VettingActor {
  characterId: number;
  name: string;
  uid: string;
  ownerHash: string;
}

export interface StoredSignOff extends VettingActor {
  at: number;
  decision: 'yes' | 'no';
  note: string;
  reasonShown?: boolean;
}

export interface StoredVettingCharacter {
  characterId: number;
  name: string;
  corporationId: number;
  corporationName: string;
  missing: VettingSource[];
  readAt: number;
  birthday?: string;
  skillPoints?: number | null;
  ownerHash?: string;
  raw?: StoredVettingRaw;
}

export interface StoredVettingRaw {
  gen: string;
  sources: Record<VettingRawSource, { rows: number; chunks: number }>;
}

export interface StoredRawChunk {
  characterId: number;
  source: VettingRawSource;
  gen: string;
  seq: number;
  rows: number;
  json: string;
  partiesJson: string;
}

export interface VettingRead {
  input: VettingCharacterInput;
  raw: Record<VettingRawSource, VettingRawRow[]>;
}

export interface StoredVettingReview {
  corporationId: number;
  corporationName: string;
  corporationTicker: string;
  state: VettingState;
  kind: VettingKind;
  role?: string;
  pilot: { characterId: number; name: string; corporationName: string };
  requestedBy?: VettingActor;
  requestMail?: { sentAt: number };
  keyHash: string | null;
  invite?: { code: string; label: string };
  note: string;
  answers?: VettingAnswer[];
  characters: StoredVettingCharacter[];
  reads: number;
  reportCharacters: VettingReportCharacter[];
  parties: VettingParty[];
  assessment: VettingAssessment | null;
  signOffs: StoredSignOff[];
  log: VettingLogEntry[];
  signOffsNeeded: number;
  rawCounts?: Record<VettingRawSource, number>;
  createdAt: number;
  readAt: number | null;
  decidedAt: number | null;
  deleteAt: number | null;
  expiresAt: number | null;
}
