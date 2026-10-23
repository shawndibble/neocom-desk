import {
  loadCorporationId,
  loadCorporationStructures,
  MASTER_WALLET_DIVISION,
} from '@/features/corp/boardData';
import { toBoardStructures } from '@/features/corp/boardSources';
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

/* Corp domains (issue #299) -------------------------------------------------- */

/**
 * The corp gate every domain below runs before its own ESI call (AC5): CCP
 * role-gates the corporation endpoints server-side, so a granted scope alone
 * does not mean the Character can read the data (`engine/corpRoles.ts`). Null
 * for "cannot fetch this poll" — corporation unknown, roles unreadable this
 * poll, or the specific role missing — always erring toward *not* calling the
 * endpoint rather than guessing. `loadCharacterRoles` is documented as cheap
 * enough to run for everyone (`features/corp/roles.ts`), and this only runs
 * for a Character whose `enabledEvents` for the domain is already non-empty.
 */
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

/* Structure fuel low ------------------------------------------------------- */

const isStructureFuelEntrySnapshot = shapeGuard<StructureFuelEntrySnapshot>({
  structureId: is.number,
  name: is.string,
  fuelExpiresMs: is.nullable(is.number),
  thresholdMs: is.number,
});

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
    // Reuses the board's own ESI-to-engine adaptation (`boardSources.ts`)
    // rather than re-parsing `fuel_expires` here — same underlying data the
    // board already loads, per the ticket brief.
    return toBoardStructures(result.cached.data).map((structure) => ({
      structureId: structure.structureId,
      name: structure.name,
      fuelExpiresMs: structure.fuelExpiresMs,
      thresholdMs,
    }));
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  // Same split as the colony domain: the baseline's baked-in `thresholdMs`
  // stays for the diff, while the Projection uses the current fuel threshold
  // so a Settings change rebuilt from that baseline (issue #1259) projects it.
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

/* Skyhook raid windows (issue #4784) ---------------------------------------- */

const isSkyhookEntrySnapshot = shapeGuard<SkyhookEntrySnapshot>({
  skyhookId: is.number,
  planetId: is.number,
  windowStartMs: is.nullable(is.number),
  windowEndMs: is.nullable(is.number),
  unsecuredUnits: is.nullable(is.number),
  leadMs: is.number,
  minUnits: is.number,
});

/**
 * The corp's skyhooks through the Sovereignty widget's own cached reads
 * (`features/corp/sovereignty.ts`): the list plus one detail per skyhook, each
 * under ESI's roughly hourly corp cache, so the poll adds no request beyond
 * that window and never fans out past `ESI_FANOUT_CONCURRENCY`. A detail that
 * cannot be read skips the poll (`null`) instead of writing a baseline that
 * would announce that skyhook's window as new once it reads again. A skyhook
 * ESI sends no window for is kept with a null window: not raidable now.
 */
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
        // A non-number is unknown, never "0 at risk".
        unsecuredUnits: unsecured !== undefined && Number.isFinite(unsecured) ? unsecured : null,
        leadMs: thresholds.skyhookRaidableLeadHours * HOUR_MS,
        minUnits: thresholds.skyhookRaidableMinUnits,
      });
    }
    return entries;
  },
  toSnapshot: (entries, nowMs) => ({ entries: [...entries], nowMs }),
  // As in the den domain: the baseline keeps the lead time the diff needs, while
  // the Projection reads the current one so a Settings change rebuilt from that
  // baseline projects the new warning time. Re-checks the role: a baseline
  // outlives a lost Station_Manager role, and a Projection nothing re-verifies
  // must not keep pushing for a corp the pilot can no longer read.
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

/* Corp industry jobs --------------------------------------------------------- */

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
  // Re-checks the role: the baseline outlives a lost Factory Manager role, and
  // a Projection nothing re-verifies must not keep pushing for a corp the
  // pilot can no longer read.
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

/* Corp roster ----------------------------------------------------------------- */

const isCorpRosterMemberSnapshot = shapeGuard<CorpRosterMemberSnapshot>({
  characterId: is.number,
});

/**
 * `/members`, not `/membertracking` — the diff only needs identity, and the
 * page that needs the richer read (`routes/CorpMembers.tsx`, #333) is a
 * second, independent consumer of the same capability. Both answer to
 * `canReadMembers` (Director-only, `engine/corpRoles.ts`), matching that
 * route's existing gate rather than inventing a narrower one for this poller.
 */
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

/* Corp wallet threshold --------------------------------------------------- */

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

/**
 * Balance-below is checked across every division `/wallets` already returns
 * in one call; transaction-above is checked only on the master division's
 * journal, since ESI publishes no all-divisions journal and the seven are
 * separately paginated and role-gated (GLOSSARY.md round 43, `boardData.ts`'s
 * `MASTER_WALLET_DIVISION` reasoning).
 */
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
    // A truncated master-division journal could lower the high-water mark
    // `diffCorpWalletThreshold` tracks, re-firing for entries already
    // reported once the next complete poll sees them again (same reasoning
    // as `walletDomain`'s truncation guard above).
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
