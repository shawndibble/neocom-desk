/**
 * The vetting backend as the pages see it. `vettingClient.ts` implements it
 * over the `vetting` callable router; stories and e2e install a stand-in with
 * `setVettingBackendOverride`, so no page needs Firebase or EVE to render.
 *
 * Every call that says who the caller is takes an EVE **access token** (never
 * a refresh token). The pilot's side of an application is proven by `key`, a
 * secret the server returns once from `start`, because an applicant has no
 * Neocom Desk session.
 */
import type {
  VettingCorpInfo,
  VettingOverview,
  VettingReview,
  VettingSettings,
  VettingStatus,
} from '@/engine/vetting';

/** Names a pilot's own review: the corp, the review and the secret from `start`. */
export interface VettingHandle {
  corporationId: number;
  reviewId: string;
  key: string;
}

export interface VettingSettingsPatch {
  on?: boolean;
  signOffs?: VettingSettings['signOffs'];
  /** Ids to drop from the watchlist. */
  removeWatch?: number[];
  /** Exact in-game names to add; the server resolves them. */
  addWatchNames?: string[];
  welcome?: string;
  contact?: string;
  /** The whole list, in order. A question with no `id` is new; the server gives it one. */
  questions?: { id?: string; label: string; required: boolean }[];
  minimums?: VettingSettings['minimums'];
  rejection?: VettingSettings['rejection'];
  inviteOnly?: boolean;
  notifyReviewers?: boolean;
  mailDecision?: boolean;
}

export interface VettingBackend {
  // Public: no session.
  /** `invite` is the code from the apply link, when it carries one. */
  corpInfo(corporationId: number, invite?: string): Promise<VettingCorpInfo>;
  /** Reads the first character and opens a draft. */
  start(
    corporationId: number,
    accessToken: string,
    invite?: string
  ): Promise<{ handle: VettingHandle; status: VettingStatus }>;
  /** Reads one more character into the draft (or re-reads one already there). */
  addCharacter(handle: VettingHandle, accessToken: string): Promise<VettingStatus>;
  removeCharacter(handle: VettingHandle, characterId: number): Promise<VettingStatus>;
  /** Runs the checks and hands the report to the corp. */
  submit(
    handle: VettingHandle,
    note: string,
    answers: { questionId: string; answer: string }[]
  ): Promise<VettingStatus>;
  status(handle: VettingHandle): Promise<VettingStatus>;
  /** Withdraws and deletes the report. */
  withdraw(handle: VettingHandle): Promise<void>;

  // A signed-in member answering an officer's request.
  /** Requests waiting for this character, each with the handle to answer it. */
  myRequests(characterId: number): Promise<{ handle: VettingHandle; status: VettingStatus }[]>;
  decline(handle: VettingHandle): Promise<void>;

  // Officers. `characterId` is the signed-in reviewer.
  overview(characterId: number, corporationId: number): Promise<VettingOverview>;
  /** Opens a report, which is logged where the pilot can see it. */
  open(characterId: number, corporationId: number, reviewId: string): Promise<VettingReview>;
  decide(
    characterId: number,
    corporationId: number,
    reviewId: string,
    decision: 'yes' | 'no',
    note: string
  ): Promise<VettingReview>;
  /** Asks a member for a review before a promotion to `role`. */
  request(
    characterId: number,
    corporationId: number,
    memberName: string,
    role: string
  ): Promise<VettingOverview>;
  /** Any reviewer may hand out an invite link. */
  createInvite(characterId: number, corporationId: number, label: string): Promise<VettingOverview>;
  revokeInvite(characterId: number, corporationId: number, code: string): Promise<VettingOverview>;
  saveSettings(
    characterId: number,
    corporationId: number,
    patch: VettingSettingsPatch
  ): Promise<VettingOverview>;
}

let override: VettingBackend | null = null;

/** Stories and e2e only. */
export function setVettingBackendOverride(backend: VettingBackend | null): void {
  override = backend;
}

export function vettingBackendOverride(): VettingBackend | null {
  return override;
}
