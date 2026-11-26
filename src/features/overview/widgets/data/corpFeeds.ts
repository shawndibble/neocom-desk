import type {
  Contract,
  CorporationCustomsOffice,
  CorporationIndustryJob,
  CorporationOrder,
} from '@/esi/endpoints';
import type { HubAggregate } from '@/market/fuzzwork';
import type { SovereigntyKind } from '@/engine/corp/sovereignty';
import type { MemberActivity, RosterDiff } from '@/engine/corp/members';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import type { RoleAuditData } from '@/features/corp/roleAudit';
import type { WalletDivision } from '@/features/corp/divisions';
import type { CorpAssetsSummary } from './corpAssetsSummary';
import type { PilotStats, ZkillFailureReason } from '@/lib/zkillboard';
import type { SrpClaim } from '@/features/corp/srpClaimTypes';
import type { CorpLabel } from '@/features/corp/corpTicker';
import type { MoonChunksBoardData, StructuresBoardData } from '../../data/boardData';

export type SrpClaimRow = Pick<
  SrpClaim,
  'killmailId' | 'state' | 'amount' | 'characterName' | 'hullTypeId' | 'solarSystemId' | 'filedAt'
>;

export interface CorpFeedBase {
  readable: boolean;
  needsReauth: boolean;
  fetchedAt: Date | null;
  fromCache: boolean;
  corporations?: ReadonlyMap<number, CorpLabel>;
  corporationOf?: ReadonlyMap<string, number>;
  partlyFailed?: boolean;
}

export interface CorpJournalLine {
  atMs: number;
  amount: number;
  refType: string;
}

export interface CorpWalletFeed extends CorpFeedBase {
  divisions: WalletDivision[];
  journalDivision: number;
  journal: CorpJournalLine[] | null;
}

export interface CorpJobsFeed extends CorpFeedBase {
  jobs: CorporationIndustryJob[];
  typeNames: ReadonlyMap<number, string>;
  installerNames: ReadonlyMap<number, string>;
}

export interface CorpCustomsFeed extends CorpFeedBase {
  offices: CorporationCustomsOffice[];
  typeNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
}

export interface CorpAssetsFeed extends CorpFeedBase {
  corporationId: number | null;
  summary: CorpAssetsSummary | null;
  truncated: boolean;
}

export interface CorpRoleAuditFeed extends CorpFeedBase {
  audit: RoleAuditData | null;
}

export interface CorpMembersFeed extends CorpFeedBase {
  members: MemberActivity[];
  diff: RosterDiff | null;
  names: ReadonlyMap<number, string>;
  darkAfterDays: number;
  loadedAt: number;
}

export interface CorpMiningFeed extends CorpFeedBase {
  rows: ObservedRow[];
  refineryCount: number;
  truncated: boolean;
  typeNames: ReadonlyMap<number, string>;
  minerNames: ReadonlyMap<number, string>;
}

export interface CorpStarbaseRow {
  starbaseId: number;
  systemId: number;
  typeId: number;
  state: string;
  reinforcedUntilMs: number | null;
  unanchorsAtMs: number | null;
  bay: { fuelBlocks: number; strontium: number } | null;
  bayReadAtMs: number | null;
}

export interface CorpStarbasesFeed extends CorpFeedBase {
  starbases: CorpStarbaseRow[];
  typeNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
}

export interface CorpContractsFeed extends CorpFeedBase {
  contracts: Contract[];
  names: ReadonlyMap<number, string>;
}

export interface CorpOrdersFeed extends CorpFeedBase {
  orders: CorporationOrder[];
  typeNames: ReadonlyMap<number, string>;
  stationNames: ReadonlyMap<number, string>;
  stationPrices: ReadonlyMap<string, HubAggregate>;
  issuerNames: ReadonlyMap<number, string>;
}

export interface CorpKillsFeed extends CorpFeedBase {
  corporationId: number | null;
  stats: PilotStats | null;
  failed: ZkillFailureReason | null;
}

export interface CorpSrpFeed extends CorpFeedBase {
  enabled: boolean;
  canSetUp: boolean;
  claims: SrpClaimRow[];
  byCorporation?: ReadonlyMap<number, { enabled: boolean; canSetUp: boolean }>;
  typeNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
}

export interface SkyhookReagent {
  typeId: number;
  secured: number;
  unsecured: number;
}

export interface CorpSovereigntyRow {
  key: string;
  kind: SovereigntyKind;
  structureId: number;
  systemId: number | null;
  planetName: string | null;
  windowStartMs: number | null;
  windowEndMs: number | null;
  reagents: SkyhookReagent[] | null;
  state: string | null;
  hubBay: { amount: number; burningPerHour: number; updatedMs: number } | null;
}

export interface CorpSovereigntyFeed extends CorpFeedBase {
  rows: CorpSovereigntyRow[];
  systemNames: ReadonlyMap<number, string>;
  typeNames: ReadonlyMap<number, string>;
  prices: ReadonlyMap<number, number>;
  jumps: ReadonlyMap<number, number>;
}

export interface CorpDeadlinesSlice {
  corporationId: number;
  structures: StructuresBoardData | null;
  moonChunks: MoonChunksBoardData | null;
  jobs: CorpJobsFeed | null;
  starbases: CorpStarbasesFeed | null;
  sovereignty: CorpSovereigntyFeed | null;
  failed: boolean;
}

export interface CorpDeadlinesAllFeed {
  corporations: CorpDeadlinesSlice[];
  labels: ReadonlyMap<number, CorpLabel>;
}

export interface CorpAllFeed<F extends CorpFeedBase> {
  corporations: { corporationId: number; feed: F }[];
  labels: ReadonlyMap<number, CorpLabel>;
  partlyFailed: boolean;
}

export async function loadCorpWalletAllFeed(): Promise<CorpAllFeed<CorpWalletFeed>> {
  const { loadCorpWalletAll } = await import('./corpFeedLoaders');
  return loadCorpWalletAll();
}

export async function loadCorpJobsAllFeed(): Promise<CorpAllFeed<CorpJobsFeed>> {
  const { loadCorpJobsAll } = await import('./corpFeedLoaders');
  return loadCorpJobsAll();
}

export async function loadCorpKillsAllFeed(): Promise<CorpAllFeed<CorpKillsFeed>> {
  const { loadCorpKillsAll } = await import('./corpFeedLoaders');
  return loadCorpKillsAll();
}

export async function loadCorpAssetsAllFeed(): Promise<CorpAllFeed<CorpAssetsFeed>> {
  const { loadCorpAssetsAll } = await import('./corpFeedLoaders');
  return loadCorpAssetsAll();
}

export async function loadCorpSrpAllFeed(): Promise<CorpSrpFeed> {
  const { loadCorpSrpAll } = await import('./corpFeedLoaders');
  return loadCorpSrpAll();
}

export async function loadCorpMembersAllFeed(): Promise<CorpMembersFeed> {
  const { loadCorpMembersAll } = await import('./corpFeedLoaders');
  return loadCorpMembersAll();
}

export async function loadCorpRoleAuditAllFeed(): Promise<CorpRoleAuditFeed> {
  const { loadCorpRoleAuditAll } = await import('./corpFeedLoaders');
  return loadCorpRoleAuditAll();
}

export async function loadCorpDeadlinesAllFeed(): Promise<CorpDeadlinesAllFeed> {
  const { loadCorpDeadlinesAll } = await import('./corpFeedLoaders');
  return loadCorpDeadlinesAll();
}

export async function loadCorpWalletFeed(characterId: number): Promise<CorpWalletFeed> {
  const { loadCorpWallet } = await import('./corpFeedLoaders');
  return loadCorpWallet(characterId);
}

export async function loadCorpJobsFeed(characterId: number): Promise<CorpJobsFeed> {
  const { loadCorpJobs } = await import('./corpFeedLoaders');
  return loadCorpJobs(characterId);
}

export async function loadCorpMembersFeed(characterId: number): Promise<CorpMembersFeed> {
  const { loadCorpMembers } = await import('./corpFeedLoaders');
  return loadCorpMembers(characterId);
}

export async function loadCorpMiningFeed(characterId: number): Promise<CorpMiningFeed> {
  const { loadCorpMining } = await import('./corpFeedLoaders');
  return loadCorpMining(characterId);
}

export async function loadCorpStarbasesFeed(characterId: number): Promise<CorpStarbasesFeed> {
  const { loadCorpStarbases } = await import('./corpFeedLoaders');
  return loadCorpStarbases(characterId);
}

export async function loadCorpContractsFeed(characterId: number): Promise<CorpContractsFeed> {
  const { loadCorpContracts } = await import('./corpFeedLoaders');
  return loadCorpContracts(characterId);
}

export async function loadCorpOrdersFeed(characterId: number): Promise<CorpOrdersFeed> {
  const { loadCorpOrders } = await import('./corpFeedLoaders');
  return loadCorpOrders(characterId);
}

export async function loadCorpKillsFeed(characterId: number): Promise<CorpKillsFeed> {
  const { loadCorpKills } = await import('./corpFeedLoaders');
  return loadCorpKills(characterId);
}

export async function loadCorpSrpFeed(characterId: number): Promise<CorpSrpFeed> {
  const { loadCorpSrp } = await import('./corpFeedLoaders');
  return loadCorpSrp(characterId);
}

export async function loadCorpAssetsFeed(characterId: number): Promise<CorpAssetsFeed> {
  const { loadCorpAssets } = await import('./corpFeedLoaders');
  return loadCorpAssets(characterId);
}

export async function loadCorpCustomsFeed(characterId: number): Promise<CorpCustomsFeed> {
  const { loadCorpCustoms } = await import('./corpFeedLoaders');
  return loadCorpCustoms(characterId);
}

export async function loadCorpRoleAuditFeed(characterId: number): Promise<CorpRoleAuditFeed> {
  const { loadCorpRoleAudit } = await import('./corpFeedLoaders');
  return loadCorpRoleAudit(characterId);
}

export async function loadCorpSovereigntyFeed(characterId: number): Promise<CorpSovereigntyFeed> {
  const { loadCorpSovereignty } = await import('./corpFeedLoaders');
  return loadCorpSovereignty(characterId);
}

export async function loadCorpCustomsAllFeed(): Promise<CorpCustomsFeed> {
  const { loadCorpCustomsAll } = await import('./corpFeedLoaders');
  return loadCorpCustomsAll();
}

export async function loadCorpStarbasesAllFeed(): Promise<CorpStarbasesFeed> {
  const { loadCorpStarbasesAll } = await import('./corpFeedLoaders');
  return loadCorpStarbasesAll();
}

export async function loadCorpSovereigntyAllFeed(): Promise<CorpSovereigntyFeed> {
  const { loadCorpSovereigntyAll } = await import('./corpFeedLoaders');
  return loadCorpSovereigntyAll();
}

export async function loadCorpContractsAllFeed(): Promise<CorpContractsFeed> {
  const { loadCorpContractsAll } = await import('./corpFeedLoaders');
  return loadCorpContractsAll();
}

export async function loadCorpOrdersAllFeed(): Promise<CorpOrdersFeed> {
  const { loadCorpOrdersAll } = await import('./corpFeedLoaders');
  return loadCorpOrdersAll();
}
