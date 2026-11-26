import type {
  VettingCorpInfo,
  VettingOverview,
  VettingRawPage,
  VettingRawSource,
  VettingReview,
  VettingSettings,
  VettingStatus,
} from '@/engine/vetting';

export interface VettingHandle {
  corporationId: number;
  reviewId: string;
  key: string;
}

export interface VettingSettingsPatch {
  on?: boolean;
  signOffs?: VettingSettings['signOffs'];
  removeWatch?: number[];
  addWatchNames?: string[];
  welcome?: string;
  contact?: string;
  questions?: { id?: string; label: string; required: boolean }[];
  minimums?: VettingSettings['minimums'];
  rejection?: VettingSettings['rejection'];
  inviteOnly?: boolean;
  notifyReviewers?: boolean;
  mailDecision?: boolean;
}

export interface VettingBackend {
  corpInfo(corporationId: number, invite?: string): Promise<VettingCorpInfo>;
  start(
    corporationId: number,
    accessToken: string,
    invite?: string
  ): Promise<{ handle: VettingHandle; status: VettingStatus }>;
  addCharacter(handle: VettingHandle, accessToken: string): Promise<VettingStatus>;
  removeCharacter(handle: VettingHandle, characterId: number): Promise<VettingStatus>;
  submit(
    handle: VettingHandle,
    note: string,
    answers: { questionId: string; answer: string }[]
  ): Promise<VettingStatus>;
  status(handle: VettingHandle): Promise<VettingStatus>;
  withdraw(handle: VettingHandle): Promise<void>;

  myRequests(characterId: number): Promise<{ handle: VettingHandle; status: VettingStatus }[]>;
  decline(handle: VettingHandle): Promise<void>;

  overview(characterId: number, corporationId: number): Promise<VettingOverview>;
  open(characterId: number, corporationId: number, reviewId: string): Promise<VettingReview>;
  rawRows(
    characterId: number,
    corporationId: number,
    reviewId: string,
    source: VettingRawSource,
    cursor?: string
  ): Promise<VettingRawPage>;
  decide(
    characterId: number,
    corporationId: number,
    reviewId: string,
    decision: 'yes' | 'no',
    note: string
  ): Promise<VettingReview>;
  request(
    characterId: number,
    corporationId: number,
    memberName: string,
    role: string
  ): Promise<VettingOverview>;
  recordRequestMail(
    characterId: number,
    corporationId: number,
    reviewId: string
  ): Promise<VettingOverview>;
  createInvite(characterId: number, corporationId: number, label: string): Promise<VettingOverview>;
  revokeInvite(characterId: number, corporationId: number, code: string): Promise<VettingOverview>;
  saveSettings(
    characterId: number,
    corporationId: number,
    patch: VettingSettingsPatch
  ): Promise<VettingOverview>;
}

let override: VettingBackend | null = null;

export function setVettingBackendOverride(backend: VettingBackend | null): void {
  override = backend;
}

export function vettingBackendOverride(): VettingBackend | null {
  return override;
}
