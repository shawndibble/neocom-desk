import {
  loadCorporationId,
  loadCorporationStructures,
  MASTER_WALLET_DIVISION,
} from '@/features/corp/boardData';
import { toBoardStructures } from '@/features/corp/boardSources';
import { loadCorporationStarbases, loadStarbaseDetails } from '@/features/corp/starbases';
import { loadGrantedScopes } from '@/app/grantedScopes';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import { summariseBay, towerFuelExpiresMs, towerLabel } from '@/engine/corp/starbases';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
import { loadCorporationSkyhooks, loadSkyhookDetails } from '@/features/corp/sovereignty';
import { loadPlanetName } from '@/features/pi/names';
import { parseInstant } from '@/engine/esiInstant';
import { loadCorporationMemberIds } from '@/features/corp/members';
import { loadCorporationWallets, loadCorporationWalletJournal } from '@/features/corp/wallet';
import { loadCharacterRoles, corpWideRoles } from '@/features/corp/roles';
import { corpCapabilities, type CorpCapability } from '@/engine/corpRoles';
import { resolveNames } from '@/features/character/names';
import {
  projectCorpIndustryJobs,
  projectSkyhookRaids,
  projectStructureFuel,
} from '@/engine/projection';
import type { CorporationIndustryJob } from '@/esi/endpoints';
import type {
  CorpIndustryJobEntrySnapshot,
  CorpIndustryJobNotificationFire,
  CorpIndustryJobSnapshot,
  CorpMemberJoinedFire,
  CorpMemberLeftFire,
  CorpRosterMemberSnapshot,
  CorpRosterSnapshot,
  CorpWalletDivisionSnapshot,
  CorpWalletJournalEntrySnapshot,
  CorpWalletSnapshot,
  CorpWalletThresholdFire,
  SkyhookEntrySnapshot,
  SkyhookRaidableFire,
  SkyhookSnapshot,
  StructureFuelEntrySnapshot,
  StructureFuelLowFire,
  StructureFuelSnapshot,
} from '@/engine/notificationDiffs';
import {
  industryItemTypeId,
  type ItemNames,
  type MemberNames,
  type PlanetNames,
} from '../domainCopy';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';
import {
  DAY_MS,
  HOUR_MS,
  currentThresholds,
  resolveProjectionNames,
  typeNameOrAbsent,
  universeTypeName,
} from './shared';

async function corpContextFor(
  characterId: number,
  capability: CorpCapability
): Promise<{ corporationId: number } | null> {
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return null;
  const rolesResult = await loadCharacterRoles(characterId);
  if (rolesResult.needsReauth || rolesResult.cached === null) return null;
  const capabilities = corpCapabilities(corpWideRoles(rolesResult.cached.data));
  if (!capabilities[capability]) return null;
  return { corporationId };
}

const isStructureFuelEntrySnapshot = shapeGuard<StructureFuelEntrySnapshot>({
  structureId: is.number,
  name: is.string,
  fuelExpiresMs: is.nullable(is.number),
  thresholdMs: is.number,
});

async function loadTowerFuel(
  characterId: number,
  corporationId: number,
  thresholdMs: number
): Promise<StructureFuelEntrySnapshot[] | null> {
  const granted = await loadGrantedScopes(characterId);
  if (!CORP_SCOPES_FOR_CAPABILITY.canReadStarbases.every((scope) => granted.has(scope))) return [];
  const rolesResult = await loadCharacterRoles(characterId);
  if (rolesResult.needsReauth || rolesResult.cached === null) return null;
  if (!corpCapabilities(corpWideRoles(rolesResult.cached.data)).canReadStarbases) return [];
  const list = await loadCorporationStarbases(characterId, corporationId);
  if (list.needsReauth || list.cached === null) return null;
  const online = list.cached.data.filter((tower) => tower.state === 'online');
  const details = await loadStarbaseDetails(characterId, corporationId, online);
  const [systems, typeNames] = await Promise.all([
    import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
    resolveProjectionNames(
      online.map((tower) => tower.type_id),
      universeTypeName
    ),
  ]);
  const entries: StructureFuelEntrySnapshot[] = [];
  for (const tower of list.cached.data) {
    const read = details.get(tower.starbase_id);
    if (tower.state === 'online' && (read === undefined || read.cached === null)) return null;
    const bay = read?.cached ? summariseBay(read.cached.data.fuels) : null;
    entries.push({
      structureId: tower.starbase_id,
      name: towerLabel(
        typeNames.get(tower.type_id) ?? `#${tower.type_id}`,
        systems?.get(tower.system_id)?.name
      ),
      fuelExpiresMs: towerFuelExpiresMs(
        { typeId: tower.type_id, state: tower.state ?? 'unknown', bay },
        read?.cached?.fetchedAt.getTime() ?? 0
      ),
      thresholdMs,
    });
  }
  return entries;
}

export const structureFuelDomain = defineDomain<
  StructureFuelEntrySnapshot,
  StructureFuelSnapshot,
  StructureFuelLowFire
>({
  source: SNAPSHOT_SOURCES.structureFuel,
  stateKey: 'notifications.pollerState.structureFuel',
  entriesKey: 'entries',
  isEntry: isStructureFuelEntrySnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadStructures');
    if (context === null) return null;
    const result = await loadCorporationStructures(characterId, context.corporationId);
    if (result.needsReauth || result.cached === null) return null;
    const thresholds = await currentThresholds(characterId);
    const thresholdMs = thresholds.structureFuelLowDays * DAY_MS;
    const structures = toBoardStructures(result.cached.data).map((structure) => ({
      structureId: structure.structureId,
      name: structure.name,
      fuelExpiresMs: structure.fuelExpiresMs,
      thresholdMs,
    }));
    const towers = await loadTowerFuel(characterId, context.corporationId, thresholdMs);
    return towers === null ? null : [...structures, ...towers];
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  projection: async (characterId, characterName, snapshot, nowMs) => {
    const thresholdMs = (await currentThresholds(characterId)).structureFuelLowDays * DAY_MS;
    return projectStructureFuel(
      characterId,
      characterName,
      snapshot.entries.map((entry) => ({ ...entry, thresholdMs })),
      NOTIFICATION_EVENT_ENTRIES.structureFuelLow.projection.push,
      nowMs
    );
  },
});

const isSkyhookEntrySnapshot = shapeGuard<SkyhookEntrySnapshot>({
  skyhookId: is.number,
  planetId: is.number,
  windowStartMs: is.nullable(is.number),
  windowEndMs: is.nullable(is.number),
  unsecuredUnits: is.nullable(is.number),
  leadMs: is.number,
  minUnits: is.number,
});

export const skyhookDomain = defineDomain<
  SkyhookEntrySnapshot,
  SkyhookSnapshot,
  SkyhookRaidableFire,
  PlanetNames
>({
  source: SNAPSHOT_SOURCES.skyhooks,
  stateKey: 'notifications.pollerState.skyhooks',
  entriesKey: 'entries',
  isEntry: isSkyhookEntrySnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadSkyhooks');
    if (context === null) return null;
    const { corporationId } = context;
    const list = await loadCorporationSkyhooks(characterId, corporationId);
    if (list.needsReauth || list.cached === null) return null;
    const skyhooks = list.cached.data.skyhooks;
    const details = await loadSkyhookDetails(
      characterId,
      corporationId,
      skyhooks.map((skyhook) => skyhook.id)
    );
    const thresholds = await currentThresholds(characterId);
    const entries: SkyhookEntrySnapshot[] = [];
    for (const skyhook of skyhooks) {
      const result = details.get(skyhook.id);
      if (result === undefined || result.needsReauth || result.cached === null) return null;
      const detail = result.cached.data;
      const reagents = detail.reagents;
      const unsecured = reagents?.reduce((sum, r) => sum + r.unsecured_stock, 0);
      entries.push({
        skyhookId: skyhook.id,
        planetId: skyhook.planet_id,
        windowStartMs: parseInstant(detail.theft_vulnerability?.start),
        windowEndMs: parseInstant(detail.theft_vulnerability?.end),
        unsecuredUnits: unsecured !== undefined && Number.isFinite(unsecured) ? unsecured : null,
        leadMs: thresholds.skyhookRaidableLeadHours * HOUR_MS,
        minUnits: thresholds.skyhookRaidableMinUnits,
      });
    }
    return entries;
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  projection: async (characterId, characterName, snapshot, nowMs) => {
    if ((await corpContextFor(characterId, 'canReadSkyhooks')) === null) return [];
    const thresholds = await currentThresholds(characterId);
    const entries = snapshot.entries.map((entry) => ({
      ...entry,
      leadMs: thresholds.skyhookRaidableLeadHours * HOUR_MS,
      minUnits: thresholds.skyhookRaidableMinUnits,
    }));
    const planetNames = await resolveProjectionNames(
      entries.filter((entry) => entry.windowStartMs !== null).map((entry) => entry.planetId),
      loadPlanetName
    );
    return projectSkyhookRaids(
      characterId,
      characterName,
      entries,
      planetNames,
      NOTIFICATION_EVENT_ENTRIES.skyhookRaidable.projection.push,
      nowMs
    );
  },
  names: async (fire) => ({ planet: (await loadPlanetName(fire.planetId)) ?? undefined }),
});

const isCorpIndustryJobEntrySnapshot = shapeGuard<CorpIndustryJobEntrySnapshot>({
  jobId: is.number,
  endMs: is.number,
  blueprintTypeId: is.number,
  productTypeId: is.nullable(is.number),
  activityId: is.number,
});

function toCorpIndustryJobEntrySnapshot(job: CorporationIndustryJob): CorpIndustryJobEntrySnapshot {
  return {
    jobId: job.job_id,
    endMs: Date.parse(job.end_date),
    blueprintTypeId: job.blueprint_type_id,
    productTypeId: job.product_type_id ?? null,
    activityId: job.activity_id,
  };
}

export const corpIndustryJobDomain = defineDomain<
  CorporationIndustryJob,
  CorpIndustryJobSnapshot,
  CorpIndustryJobNotificationFire,
  ItemNames
>({
  source: SNAPSHOT_SOURCES.corpIndustryJobs,
  stateKey: 'notifications.pollerState.corpIndustryJobs',
  entriesKey: 'entries',
  isEntry: isCorpIndustryJobEntrySnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadIndustry');
    if (context === null) return null;
    const result = await loadCorporationIndustryJobs(characterId, context.corporationId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (jobs, nowMs) => ({ entries: jobs.map(toCorpIndustryJobEntrySnapshot), nowMs }),
  projection: async (characterId, characterName, snapshot, nowMs) => {
    if ((await corpContextFor(characterId, 'canReadIndustry')) === null) return [];
    const itemNames = await resolveProjectionNames(
      snapshot.entries.map((entry) => entry.productTypeId ?? entry.blueprintTypeId),
      universeTypeName
    );
    return projectCorpIndustryJobs(
      characterId,
      characterName,
      snapshot.entries,
      itemNames,
      NOTIFICATION_EVENT_ENTRIES.corpIndustryJobReady.projection.push,
      nowMs
    );
  },
  names: async (fire) => ({ item: await typeNameOrAbsent(industryItemTypeId(fire)) }),
});

const isCorpRosterMemberSnapshot = shapeGuard<CorpRosterMemberSnapshot>({
  characterId: is.number,
});

export const corpRosterDomain = defineDomain<
  number,
  CorpRosterSnapshot,
  CorpMemberJoinedFire | CorpMemberLeftFire,
  MemberNames
>({
  source: SNAPSHOT_SOURCES.corpRoster,
  stateKey: 'notifications.pollerState.corpRoster',
  entriesKey: 'entries',
  isEntry: isCorpRosterMemberSnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadMembers');
    if (context === null) return null;
    const result = await loadCorporationMemberIds(characterId, context.corporationId);
    if (result.needsReauth || result.cached === null) return null;
    return result.cached.data;
  },
  toSnapshot: (memberIds, nowMs) => ({
    entries: memberIds.map((characterId) => ({ characterId })),
    nowMs,
  }),
  names: async (fire) => ({
    member: (await resolveNames([fire.memberCharacterId])).get(fire.memberCharacterId),
  }),
});

const isCorpWalletJournalEntrySnapshot = shapeGuard<CorpWalletJournalEntrySnapshot>({
  id: is.number,
  amount: is.nullable(is.number),
});

const isCorpWalletDivisionSnapshot = shapeGuard<CorpWalletDivisionSnapshot>({
  division: is.number,
  balance: is.number,
  journal: is.arrayOf(isCorpWalletJournalEntrySnapshot),
  balanceFloorIsk: is.number,
  transactionCeilingIsk: is.number,
});

export const corpWalletDomain = defineDomain<
  CorpWalletDivisionSnapshot,
  CorpWalletSnapshot,
  CorpWalletThresholdFire
>({
  source: SNAPSHOT_SOURCES.corpWallet,
  stateKey: 'notifications.pollerState.corpWallet',
  entriesKey: 'divisions',
  isEntry: isCorpWalletDivisionSnapshot,
  load: async (characterId) => {
    const context = await corpContextFor(characterId, 'canReadWallet');
    if (context === null) return null;
    const walletsResult = await loadCorporationWallets(characterId, context.corporationId);
    if (walletsResult.needsReauth || walletsResult.cached === null) return null;
    const journalResult = await loadCorporationWalletJournal(
      characterId,
      context.corporationId,
      MASTER_WALLET_DIVISION
    );
    if (journalResult.needsReauth || journalResult.cached === null) return null;
    if (journalResult.cached.truncated) return null;
    const journalEntries = journalResult.cached.data;
    const thresholds = await currentThresholds(characterId);
    return walletsResult.cached.data.map((division) => ({
      division: division.division,
      balance: division.balance,
      journal:
        division.division === MASTER_WALLET_DIVISION
          ? journalEntries.map((entry) => ({
              id: entry.id,
              amount: entry.amount ?? null,
            }))
          : [],
      balanceFloorIsk: thresholds.corpWalletBalanceFloorIsk,
      transactionCeilingIsk: thresholds.corpWalletTransactionCeilingIsk,
    }));
  },
  toSnapshot: (divisions, nowMs) => ({ divisions: [...divisions], nowMs }),
});
