import { describe, it, expect, vi } from 'vitest';

// The sell-order copy names the item. Resolving it for real would read the
// bundled SDE snapshot over HTTP and fall through to ESI, neither of which is
// served here — so the lookup is stubbed, and the unresolvable case gets its
// own test below rather than being every test's accidental behaviour.
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(async (typeIds: readonly number[]) => {
    const names = new Map<number, string>([[34, 'Tritanium']]);
    return new Map([...names].filter(([id]) => typeIds.includes(id)));
  }),
}));
import type {
  SkillQueueEntry,
  IndustryJob,
  MailHeader,
  CalendarEventSummary,
  Contract,
  CharacterNotification,
} from '@/esi/endpoints';
import {
  runForegroundPoll,
  type DomainPollState,
  type PollDependencies,
  type CharacterRef,
} from './foregroundPoller';
import type {
  SkillQueueSnapshot,
  IndustryJobSnapshot,
  PlanetarySnapshot,
  MailSnapshot,
  CalendarSnapshot,
  ContractSnapshot,
  WalletSnapshot,
  WalletJournalEntrySnapshot,
  MarketOrderSnapshot,
  ColonySnapshotEntry,
  MarketOrderEntrySnapshot,
  EveNotificationSnapshot,
} from '@/engine/notificationDiffs';
import type { PollerState } from './pollerState';
import { occurrenceKey } from '@/engine/occurrenceKey';

// The eight per-domain state types the poller used to carry as named
// dependencies. They are now one generic shape (`PollerState<T>`); these
// aliases keep every case below reading exactly as it did before #273.
type SkillQueuePollerState = PollerState<SkillQueueSnapshot>;
type IndustryJobPollerState = PollerState<IndustryJobSnapshot>;
type ColonyPollerState = PollerState<PlanetarySnapshot>;
type MailPollerState = PollerState<MailSnapshot>;
type CalendarPollerState = PollerState<CalendarSnapshot>;
type ContractPollerState = PollerState<ContractSnapshot>;
type WalletPollerState = PollerState<WalletSnapshot>;
type MarketOrderPollerState = PollerState<MarketOrderSnapshot>;
type EveNotificationPollerState = PollerState<EveNotificationSnapshot>;

const CHAR: CharacterRef = { characterId: 1, name: 'Test Pilot' };
const SKILLQUEUE_SCOPE = 'esi-skills.read_skillqueue.v1';
const INDUSTRY_JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';
const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';
const MAIL_SCOPE = 'esi-mail.read_mail.v1';
const CALENDAR_SCOPE = 'esi-calendar.read_calendar_events.v1';
const CONTRACTS_SCOPE = 'esi-contracts.read_character_contracts.v1';
const WALLET_SCOPE = 'esi-wallet.read_character_wallet.v1';
const MARKET_ORDERS_SCOPE = 'esi-markets.read_character_orders.v1';
const NOTIFICATIONS_SCOPE = 'esi-characters.read_notifications.v1';

function queueEntry(overrides: Partial<SkillQueueEntry> = {}): SkillQueueEntry {
  return {
    skill_id: 100,
    finished_level: 1,
    queue_position: 0,
    ...overrides,
  } as SkillQueueEntry;
}

function industryJob(overrides: Partial<IndustryJob> = {}): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 1000,
    facility_id: 1,
    station_id: 1,
    runs: 1,
    start_date: '2026-01-01T00:00:00Z',
    end_date: '2026-01-01T01:00:00Z',
    status: 'active',
    ...overrides,
  };
}

function mailHeader(overrides: Partial<MailHeader> = {}): MailHeader {
  return { mail_id: 1, ...overrides };
}

function calendarEvent(overrides: Partial<CalendarEventSummary> = {}): CalendarEventSummary {
  return {
    event_id: 1,
    event_date: '2026-01-01T01:00:00Z',
    title: 'Ops',
    importance: 0,
    event_response: 'not_responded',
    ...overrides,
  };
}

/**
 * `walletDomain.load` (`pollDomains.ts`) now bakes the Character's threshold
 * onto each entry it returns, since `toSnapshot` is a pure passthrough for
 * this domain (the wallet-balance-threshold feature) — so this harness's fake
 * loader, which bypasses `load` entirely, must hand back entries already in
 * that shape rather than the raw ESI `WalletJournalEntry`. `thresholdIsk`
 * defaults to 0 so every case below keeps firing exactly as it did before the
 * threshold existed, unless a case opts into testing the threshold itself.
 */
function walletJournalEntry(
  overrides: Partial<WalletJournalEntrySnapshot> = {}
): WalletJournalEntrySnapshot {
  return { id: 1, amount: 100, thresholdIsk: 0, dateMs: 1_000_000, ...overrides };
}

function eveNotification(overrides: Partial<CharacterNotification> = {}): CharacterNotification {
  return {
    notification_id: 1,
    type: 'BillOutOfMoneyMsg',
    sender_id: 1000132,
    sender_type: 'corporation',
    text: 'amount: 12345\n',
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    contract_id: 1,
    issuer_id: 1,
    issuer_corporation_id: 1,
    assignee_id: 1,
    acceptor_id: 0,
    type: 'courier',
    status: 'outstanding',
    for_corporation: false,
    availability: 'personal',
    date_issued: '2026-01-01T00:00:00Z',
    date_expired: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * The per-domain dependencies that used to sit flat on `PollDependencies`.
 * `baseDeps` maps them onto the registry seam (`loadDomain`/`domainState`) by
 * domain id, so the cases below still name the domain they are about.
 */
interface DomainOverrides {
  loadSkillQueue?: (characterId: number) => Promise<SkillQueueEntry[] | null>;
  prevState?: () => Promise<SkillQueuePollerState>;
  saveState?: (state: SkillQueuePollerState) => Promise<void>;
  loadIndustryJobs?: (characterId: number) => Promise<IndustryJob[] | null>;
  prevIndustryJobState?: () => Promise<IndustryJobPollerState>;
  saveIndustryJobState?: (state: IndustryJobPollerState) => Promise<void>;
  loadColonyExtractors?: (characterId: number) => Promise<ColonySnapshotEntry[] | null>;
  prevColonyState?: () => Promise<ColonyPollerState>;
  saveColonyState?: (state: ColonyPollerState) => Promise<void>;
  loadMail?: (characterId: number) => Promise<MailHeader[] | null>;
  prevMailState?: () => Promise<MailPollerState>;
  saveMailState?: (state: MailPollerState) => Promise<void>;
  loadCalendarEvents?: (characterId: number) => Promise<CalendarEventSummary[] | null>;
  prevCalendarState?: () => Promise<CalendarPollerState>;
  saveCalendarState?: (state: CalendarPollerState) => Promise<void>;
  loadContracts?: (characterId: number) => Promise<Contract[] | null>;
  prevContractState?: () => Promise<ContractPollerState>;
  saveContractState?: (state: ContractPollerState) => Promise<void>;
  loadWalletJournal?: (characterId: number) => Promise<WalletJournalEntrySnapshot[] | null>;
  prevWalletState?: () => Promise<WalletPollerState>;
  saveWalletState?: (state: WalletPollerState) => Promise<void>;
  loadMarketOrders?: (characterId: number) => Promise<MarketOrderEntrySnapshot[] | null>;
  prevMarketOrderState?: () => Promise<MarketOrderPollerState>;
  saveMarketOrderState?: (state: MarketOrderPollerState) => Promise<void>;
  loadEveNotifications?: (characterId: number) => Promise<CharacterNotification[] | null>;
  prevEveNotificationState?: () => Promise<EveNotificationPollerState>;
  saveEveNotificationState?: (state: EveNotificationPollerState) => Promise<void>;
}

/**
 * Bridges one domain's old `prev*`/`save*` pair onto `DomainPollState`. The
 * unsupplied half behaves exactly as the old defaults did: an in-memory state
 * that only the default saver writes to.
 */
function domainState<T>(
  prev: (() => Promise<PollerState<T>>) | undefined,
  save: ((state: PollerState<T>) => Promise<void>) | undefined
): DomainPollState {
  let stored: PollerState<T> = {};
  return {
    prev: prev ?? (async () => stored),
    save: save
      ? (state) => save(state as PollerState<T>)
      : async (state) => {
          stored = state as PollerState<T>;
        },
  };
}

function baseDeps(overrides: Partial<PollDependencies> & DomainOverrides = {}): PollDependencies {
  const {
    loadSkillQueue = async () => [],
    prevState,
    saveState,
    loadIndustryJobs = async () => [],
    prevIndustryJobState,
    saveIndustryJobState,
    loadColonyExtractors = async () => [],
    prevColonyState,
    saveColonyState,
    loadMail = async () => [],
    prevMailState,
    saveMailState,
    loadCalendarEvents = async () => [],
    prevCalendarState,
    saveCalendarState,
    loadContracts = async () => [],
    prevContractState,
    saveContractState,
    loadWalletJournal = async () => [],
    prevWalletState,
    saveWalletState,
    loadMarketOrders = async () => [],
    prevMarketOrderState,
    saveMarketOrderState,
    loadEveNotifications = async () => [],
    prevEveNotificationState,
    saveEveNotificationState,
    ...rest
  } = overrides;

  const loaders: Record<string, (characterId: number) => Promise<readonly unknown[] | null>> = {
    skillQueue: loadSkillQueue,
    industryJobs: loadIndustryJobs,
    colonies: loadColonyExtractors,
    mail: loadMail,
    calendar: loadCalendarEvents,
    contracts: loadContracts,
    wallet: loadWalletJournal,
    marketOrders: loadMarketOrders,
    eveNotification: loadEveNotifications,
    // Corp domains (issue #299): no dedicated overrides here — their
    // load/diff behaviour is covered in pollDomains.test.ts and
    // notificationDiffs.test.ts, so a bare "nothing to fetch" default is
    // enough to keep the generic delivery-loop cases above from tripping
    // over a ninth-and-up registry entry they know nothing about.
    structureFuel: async () => [],
    corpIndustryJobs: async () => [],
    corpRoster: async () => [],
    corpWallet: async () => [],
  };
  const states: Record<string, DomainPollState> = {
    skillQueue: domainState(prevState, saveState),
    industryJobs: domainState(prevIndustryJobState, saveIndustryJobState),
    colonies: domainState(prevColonyState, saveColonyState),
    mail: domainState(prevMailState, saveMailState),
    calendar: domainState(prevCalendarState, saveCalendarState),
    contracts: domainState(prevContractState, saveContractState),
    wallet: domainState(prevWalletState, saveWalletState),
    marketOrders: domainState(prevMarketOrderState, saveMarketOrderState),
    eveNotification: domainState(prevEveNotificationState, saveEveNotificationState),
    structureFuel: domainState(undefined, undefined),
    corpIndustryJobs: domainState(undefined, undefined),
    corpRoster: domainState(undefined, undefined),
    corpWallet: domainState(undefined, undefined),
  };

  return {
    now: () => 1_000_000,
    characters: async () => [CHAR],
    grantedScopes: async () => new Set([SKILLQUEUE_SCOPE]),
    loadDomain: (domain, characterId) => loaders[domain.id](characterId),
    domainState: (domain) => states[domain.id],
    masterEnabled: async () => true,
    browserChannelEnabled: async () => true,
    feedChannelEnabled: async () => false,
    eventPrefsFor: async () => ({}),
    eveTypePrefsFor: async () => ({}),
    permission: () => 'granted',
    notify: vi.fn(async () => {}),
    recordToFeed: vi.fn(async () => {}),
    alreadyDelivered: vi.fn(async () => false),
    uploadProjection: vi.fn(async () => {}),
    ...rest,
  };
}

describe('runForegroundPoll', () => {
  it('does nothing when the master switch is off', async () => {
    const characters = vi.fn(async () => [CHAR]);
    const deps = baseDeps({ masterEnabled: async () => false, characters });
    await runForegroundPoll(deps);
    expect(characters).not.toHaveBeenCalled();
  });

  it('does nothing when neither channel can show anything', async () => {
    const characters = vi.fn(async () => [CHAR]);
    const deps = baseDeps({ permission: () => 'default', characters });
    await runForegroundPoll(deps);
    expect(characters).not.toHaveBeenCalled();
  });

  it('skips a character with no granted skill-queue scope', async () => {
    const loadSkillQueue = vi.fn(async () => []);
    const deps = baseDeps({ grantedScopes: async () => new Set(), loadSkillQueue });
    await runForegroundPoll(deps);
    expect(loadSkillQueue).not.toHaveBeenCalled();
  });

  it('skips a character whose events are all individually disabled', async () => {
    const loadSkillQueue = vi.fn(async () => []);
    const deps = baseDeps({
      eventPrefsFor: async () => ({ skillLevelComplete: false, characterNotTraining: false }),
      loadSkillQueue,
    });
    await runForegroundPoll(deps);
    expect(loadSkillQueue).not.toHaveBeenCalled();
  });

  it('persists a snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let saved: SkillQueuePollerState | null = null;
    const deps = baseDeps({
      loadSkillQueue: async () => [queueEntry({ finished_level: 3 })],
      saveState: async (state) => {
        saved = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(saved).not.toBeNull();
    expect(saved![CHAR.characterId].entries).toEqual([
      { skillId: 100, finishedLevel: 3, queuePosition: 0, finishMs: null },
    ]);
  });

  it('fires characterNotTraining when a character stops training between two polls', async () => {
    let now = 1000;
    let saved: SkillQueuePollerState = {
      [CHAR.characterId]: {
        entries: [{ skillId: 100, finishedLevel: 1, queuePosition: 0, finishMs: 2000 }],
        nowMs: now,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      now: () => now,
      prevState: async () => saved,
      saveState: async (state) => {
        saved = state;
      },
      loadSkillQueue: async () => [],
      notify,
    });
    now = 3000;
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire.eventId).toBe('characterNotTraining');
    expect(character).toEqual(CHAR);
  });

  it('only runs diffs for events the character has enabled', async () => {
    let saved: SkillQueuePollerState = {
      [CHAR.characterId]: {
        entries: [{ skillId: 100, finishedLevel: 1, queuePosition: 0, finishMs: 2000 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn(async () => {});
    const deps = baseDeps({
      now: () => 3000,
      prevState: async () => saved,
      saveState: async (state) => {
        saved = state;
      },
      loadSkillQueue: async () => [],
      eventPrefsFor: async () => ({ characterNotTraining: false }),
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not update saved state or notify when the ESI fetch fails', async () => {
    const initial: SkillQueuePollerState = {
      [CHAR.characterId]: { entries: [], nowMs: 500 },
    };
    let saved = initial;
    const saveState = vi.fn(async (state: SkillQueuePollerState) => {
      saved = state;
    });
    const deps = baseDeps({
      prevState: async () => initial,
      saveState,
      loadSkillQueue: async () => null,
    });
    await runForegroundPoll(deps);
    expect(saveState).not.toHaveBeenCalled();
    expect(saved).toBe(initial);
  });

  it('polls multiple characters independently', async () => {
    const charB: CharacterRef = { characterId: 2, name: 'Second Pilot' };
    let saved: SkillQueuePollerState = {};
    const deps = baseDeps({
      characters: async () => [CHAR, charB],
      loadSkillQueue: async (characterId) => [queueEntry({ skill_id: characterId * 10 })],
      saveState: async (state) => {
        saved = state;
      },
    });
    await runForegroundPoll(deps);
    expect(saved[CHAR.characterId]).toBeDefined();
    expect(saved[charB.characterId]).toBeDefined();
  });

  it('skips industry jobs for a character with no granted scope', async () => {
    const loadIndustryJobs = vi.fn(async () => []);
    const deps = baseDeps({ loadIndustryJobs });
    await runForegroundPoll(deps);
    expect(loadIndustryJobs).not.toHaveBeenCalled();
  });

  it('skips industry jobs for a character who toggled the event off despite having the scope', async () => {
    const loadIndustryJobs = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, INDUSTRY_JOBS_SCOPE]),
      eventPrefsFor: async () => ({ industryJobComplete: false }),
      loadIndustryJobs,
    });
    await runForegroundPoll(deps);
    expect(loadIndustryJobs).not.toHaveBeenCalled();
  });

  it('persists a job snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedJobs: IndustryJobPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, INDUSTRY_JOBS_SCOPE]),
      loadIndustryJobs: async () => [industryJob()],
      saveIndustryJobState: async (state) => {
        savedJobs = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedJobs).not.toBeNull();
    expect(savedJobs![CHAR.characterId].entries).toEqual([
      {
        jobId: 1,
        endMs: Date.parse('2026-01-01T01:00:00Z'),
        blueprintTypeId: 1000,
        productTypeId: null,
        activityId: 1,
      },
    ]);
  });

  it('fires industryJobComplete when a job newly finishes between two polls', async () => {
    let now = Date.parse('2026-01-01T00:30:00Z');
    let savedJobs: IndustryJobPollerState = {
      [CHAR.characterId]: {
        entries: [
          {
            jobId: 1,
            endMs: Date.parse('2026-01-01T01:00:00Z'),
            blueprintTypeId: 1000,
            productTypeId: 2000,
            activityId: 1,
          },
        ],
        nowMs: now,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      now: () => now,
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, INDUSTRY_JOBS_SCOPE]),
      prevIndustryJobState: async () => savedJobs,
      saveIndustryJobState: async (state) => {
        savedJobs = state;
      },
      loadIndustryJobs: async () => [
        industryJob({ end_date: '2026-01-01T01:00:00Z', product_type_id: 2000 }),
      ],
      notify,
    });
    now = Date.parse('2026-01-01T01:30:00Z');
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'industryJobComplete',
      characterId: CHAR.characterId,
      jobId: 1,
      blueprintTypeId: 1000,
      productTypeId: 2000,
      activityId: 1,
    });
    expect(character).toEqual(CHAR);
  });

  it('skips planetary extraction for a character with no granted scope', async () => {
    const loadColonyExtractors = vi.fn(async () => []);
    const deps = baseDeps({ loadColonyExtractors });
    await runForegroundPoll(deps);
    expect(loadColonyExtractors).not.toHaveBeenCalled();
  });

  it('skips planetary extraction for a character who toggled every colony event off despite having the scope', async () => {
    const loadColonyExtractors = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, PLANETS_SCOPE]),
      eventPrefsFor: async () => ({
        planetaryExtractionDone: false,
        planetaryExtractorExpiring: false,
      }),
      loadColonyExtractors,
    });
    await runForegroundPoll(deps);
    expect(loadColonyExtractors).not.toHaveBeenCalled();
  });

  it("still fetches colonies when only one of the domain's two events is on (issue #310)", async () => {
    // One snapshot answers for both planetary events, so the fetch is skipped
    // only when every event of the domain is off — which is what makes each
    // diff's own `gatedOn` gate load-bearing rather than redundant.
    const loadColonyExtractors = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, PLANETS_SCOPE]),
      eventPrefsFor: async () => ({ planetaryExtractionDone: false }),
      loadColonyExtractors,
    });
    await runForegroundPoll(deps);
    expect(loadColonyExtractors).toHaveBeenCalled();
  });

  it('persists a colony snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedColonies: ColonyPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, PLANETS_SCOPE]),
      loadColonyExtractors: async () => [
        { planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: 2000 }] },
      ],
      saveColonyState: async (state) => {
        savedColonies = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedColonies).not.toBeNull();
    expect(savedColonies![CHAR.characterId].colonies).toEqual([
      { planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: 2000 }] },
    ]);
  });

  it('fires planetaryExtractionDone when a colony newly goes idle between two polls', async () => {
    let now = 1000;
    let savedColonies: ColonyPollerState = {
      [CHAR.characterId]: {
        colonies: [{ planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: 2000 }] }],
        nowMs: now,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      now: () => now,
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, PLANETS_SCOPE]),
      prevColonyState: async () => savedColonies,
      saveColonyState: async (state) => {
        savedColonies = state;
      },
      loadColonyExtractors: async () => [
        { planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: 2000 }] },
      ],
      notify,
    });
    now = 3000;
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'planetaryExtractionDone',
      characterId: CHAR.characterId,
      planetId: 40000001,
      expiryTimeMs: 2000,
    });
    expect(character).toEqual(CHAR);
  });

  it('skips mail for a character with no granted scope', async () => {
    const loadMail = vi.fn(async () => []);
    const deps = baseDeps({ loadMail });
    await runForegroundPoll(deps);
    expect(loadMail).not.toHaveBeenCalled();
  });

  it('skips mail for a character who toggled the event off despite having the scope', async () => {
    const loadMail = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MAIL_SCOPE]),
      eventPrefsFor: async () => ({ newMail: false }),
      loadMail,
    });
    await runForegroundPoll(deps);
    expect(loadMail).not.toHaveBeenCalled();
  });

  it('persists a mail snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedMail: MailPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MAIL_SCOPE]),
      loadMail: async () => [mailHeader({ mail_id: 5 })],
      saveMailState: async (state) => {
        savedMail = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedMail).not.toBeNull();
    expect(savedMail![CHAR.characterId].entries).toEqual([{ mailId: 5 }]);
  });

  it('fires newMail when a mail id above the previous high-water mark appears', async () => {
    let savedMail: MailPollerState = {
      [CHAR.characterId]: { entries: [{ mailId: 5 }], nowMs: 1000 },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MAIL_SCOPE]),
      prevMailState: async () => savedMail,
      saveMailState: async (state) => {
        savedMail = state;
      },
      loadMail: async () => [mailHeader({ mail_id: 6 }), mailHeader({ mail_id: 5 })],
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({ eventId: 'newMail', characterId: CHAR.characterId, mailId: 6 });
    expect(character).toEqual(CHAR);
  });

  it('skips calendar events for a character with no granted scope', async () => {
    const loadCalendarEvents = vi.fn(async () => []);
    const deps = baseDeps({ loadCalendarEvents });
    await runForegroundPoll(deps);
    expect(loadCalendarEvents).not.toHaveBeenCalled();
  });

  it('skips calendar events for a character who toggled both calendar events off despite having the scope', async () => {
    const loadCalendarEvents = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, CALENDAR_SCOPE]),
      eventPrefsFor: async () => ({ newCalendarEvent: false, calendarEventStarting: false }),
      loadCalendarEvents,
    });
    await runForegroundPoll(deps);
    expect(loadCalendarEvents).not.toHaveBeenCalled();
  });

  it('persists a calendar snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedCalendar: CalendarPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, CALENDAR_SCOPE]),
      loadCalendarEvents: async () => [
        calendarEvent({ event_id: 9, event_date: '2026-01-01T02:00:00Z' }),
      ],
      saveCalendarState: async (state) => {
        savedCalendar = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedCalendar).not.toBeNull();
    expect(savedCalendar![CHAR.characterId].entries).toEqual([
      { calendarEventId: 9, startMs: Date.parse('2026-01-01T02:00:00Z') },
    ]);
  });

  it('fires newCalendarEvent when an event id above the previous high-water mark appears', async () => {
    let savedCalendar: CalendarPollerState = {
      [CHAR.characterId]: {
        entries: [{ calendarEventId: 5, startMs: Date.parse('2026-01-05T00:00:00Z') }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, CALENDAR_SCOPE]),
      eventPrefsFor: async () => ({ newCalendarEvent: true, calendarEventStarting: false }),
      prevCalendarState: async () => savedCalendar,
      saveCalendarState: async (state) => {
        savedCalendar = state;
      },
      loadCalendarEvents: async () => [
        calendarEvent({ event_id: 6, event_date: '2026-01-06T00:00:00Z' }),
        calendarEvent({ event_id: 5, event_date: '2026-01-05T00:00:00Z' }),
      ],
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'newCalendarEvent',
      characterId: CHAR.characterId,
      calendarEventId: 6,
    });
    expect(character).toEqual(CHAR);
  });

  it('fires calendarEventStarting when an event newly starts between two polls', async () => {
    let now = Date.parse('2026-01-01T00:30:00Z');
    let savedCalendar: CalendarPollerState = {
      [CHAR.characterId]: {
        entries: [{ calendarEventId: 1, startMs: Date.parse('2026-01-01T01:00:00Z') }],
        nowMs: now,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      now: () => now,
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, CALENDAR_SCOPE]),
      eventPrefsFor: async () => ({ newCalendarEvent: false, calendarEventStarting: true }),
      prevCalendarState: async () => savedCalendar,
      saveCalendarState: async (state) => {
        savedCalendar = state;
      },
      loadCalendarEvents: async () => [
        calendarEvent({ event_id: 1, event_date: '2026-01-01T01:00:00Z' }),
      ],
      notify,
    });
    now = Date.parse('2026-01-01T01:30:00Z');
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'calendarEventStarting',
      characterId: CHAR.characterId,
      calendarEventId: 1,
    });
    expect(character).toEqual(CHAR);
  });

  it('skips contracts for a character with no granted scope', async () => {
    const loadContracts = vi.fn(async () => []);
    const deps = baseDeps({ loadContracts });
    await runForegroundPoll(deps);
    expect(loadContracts).not.toHaveBeenCalled();
  });

  it('skips contracts for a character who toggled the event off despite having the scope', async () => {
    const loadContracts = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, CONTRACTS_SCOPE]),
      eventPrefsFor: async () => ({ contractAccepted: false }),
      loadContracts,
    });
    await runForegroundPoll(deps);
    expect(loadContracts).not.toHaveBeenCalled();
  });

  it('leaves the contract baseline untouched and fires nothing when the load is truncated', async () => {
    // The truncation guard itself (loadContracts returning null on a short
    // page set) is pollDomains.test.ts's job; this is the other half of
    // AC4 — that a null load actually skips the poll end to end, the same
    // property the skill-queue "ESI fetch fails" case above proves for its
    // own domain.
    const initial: ContractPollerState = {
      [CHAR.characterId]: { entries: [{ contractId: 1, status: 'outstanding' }], nowMs: 500 },
    };
    const saveContractState = vi.fn(async () => {});
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([CONTRACTS_SCOPE]),
      prevContractState: async () => initial,
      saveContractState,
      loadContracts: async () => null,
      notify,
    });
    await runForegroundPoll(deps);
    expect(saveContractState).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('persists a contract snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedContracts: ContractPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, CONTRACTS_SCOPE]),
      loadContracts: async () => [contract({ contract_id: 1, status: 'outstanding' })],
      saveContractState: async (state) => {
        savedContracts = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedContracts).not.toBeNull();
    expect(savedContracts![CHAR.characterId].entries).toEqual([
      { contractId: 1, status: 'outstanding' },
    ]);
  });

  it('fires contractAccepted when a contract newly transitions to in_progress', async () => {
    let savedContracts: ContractPollerState = {
      [CHAR.characterId]: {
        entries: [{ contractId: 1, status: 'outstanding' }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, CONTRACTS_SCOPE]),
      prevContractState: async () => savedContracts,
      saveContractState: async (state) => {
        savedContracts = state;
      },
      loadContracts: async () => [contract({ contract_id: 1, status: 'in_progress' })],
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'contractAccepted',
      characterId: CHAR.characterId,
      contractId: 1,
    });
    expect(character).toEqual(CHAR);
  });

  it('skips the wallet journal for a character with no granted scope', async () => {
    const loadWalletJournal = vi.fn(async () => []);
    const deps = baseDeps({ loadWalletJournal });
    await runForegroundPoll(deps);
    expect(loadWalletJournal).not.toHaveBeenCalled();
  });

  it('skips the wallet journal for a character who toggled the event off despite having the scope', async () => {
    const loadWalletJournal = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, WALLET_SCOPE]),
      eventPrefsFor: async () => ({ walletBalanceChanged: false }),
      loadWalletJournal,
    });
    await runForegroundPoll(deps);
    expect(loadWalletJournal).not.toHaveBeenCalled();
  });

  it('leaves the wallet high-water mark untouched and fires nothing when the load is truncated', async () => {
    const initial: WalletPollerState = {
      [CHAR.characterId]: {
        entries: [{ id: 5, amount: 100, thresholdIsk: 0, dateMs: 1_000_000 }],
        nowMs: 500,
      },
    };
    const saveWalletState = vi.fn(async () => {});
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([WALLET_SCOPE]),
      prevWalletState: async () => initial,
      saveWalletState,
      loadWalletJournal: async () => null,
      notify,
    });
    await runForegroundPoll(deps);
    expect(saveWalletState).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('persists a wallet snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedWallet: WalletPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, WALLET_SCOPE]),
      eventPrefsFor: async () => ({ walletBalanceChanged: { browser: true } }),
      loadWalletJournal: async () => [walletJournalEntry({ id: 5, amount: 100 })],
      saveWalletState: async (state) => {
        savedWallet = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedWallet).not.toBeNull();
    expect(savedWallet![CHAR.characterId].entries).toEqual([
      { id: 5, amount: 100, thresholdIsk: 0, dateMs: 1_000_000 },
    ]);
  });

  it('records walletBalanceChanged to the feed but does not raise a browser notification by default (feed-only, CONTEXT.md round 45)', async () => {
    const savedWallet: WalletPollerState = {
      [CHAR.characterId]: {
        entries: [{ id: 5, amount: 100, thresholdIsk: 0, dateMs: 1_000_000 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const recordToFeed = vi.fn<PollDependencies['recordToFeed']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, WALLET_SCOPE]),
      feedChannelEnabled: async () => true,
      prevWalletState: async () => savedWallet,
      loadWalletJournal: async () => [
        walletJournalEntry({ id: 6, amount: 250 }),
        walletJournalEntry({ id: 5, amount: 100 }),
      ],
      notify,
      recordToFeed,
    });
    await runForegroundPoll(deps);
    expect(recordToFeed).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('fires walletBalanceChanged when a journal entry id above the previous high-water mark appears', async () => {
    let savedWallet: WalletPollerState = {
      [CHAR.characterId]: {
        entries: [{ id: 5, amount: 100, thresholdIsk: 0, dateMs: 1_000_000 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, WALLET_SCOPE]),
      eventPrefsFor: async () => ({ walletBalanceChanged: { browser: true } }),
      prevWalletState: async () => savedWallet,
      saveWalletState: async (state) => {
        savedWallet = state;
      },
      loadWalletJournal: async () => [
        walletJournalEntry({ id: 6, amount: 250 }),
        walletJournalEntry({ id: 5, amount: 100 }),
      ],
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'walletBalanceChanged',
      characterId: CHAR.characterId,
      amount: 250,
      journalEntryId: 6,
      dateMs: 1_000_000,
    });
    expect(character).toEqual(CHAR);
  });

  it('skips market orders for a character with no granted scope', async () => {
    const loadMarketOrders = vi.fn(async () => []);
    const deps = baseDeps({ loadMarketOrders });
    await runForegroundPoll(deps);
    expect(loadMarketOrders).not.toHaveBeenCalled();
  });

  it('skips market orders for a character who toggled the event off despite having the scope', async () => {
    const loadMarketOrders = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      eventPrefsFor: async () => ({ marketOrderFilled: false }),
      loadMarketOrders,
    });
    await runForegroundPoll(deps);
    expect(loadMarketOrders).not.toHaveBeenCalled();
  });

  it('leaves the market-order baseline untouched and fires nothing when the load is truncated', async () => {
    const initial: MarketOrderPollerState = {
      [CHAR.characterId]: {
        entries: [{ orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 }],
        nowMs: 500,
      },
    };
    const saveMarketOrderState = vi.fn(async () => {});
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([MARKET_ORDERS_SCOPE]),
      prevMarketOrderState: async () => initial,
      saveMarketOrderState,
      loadMarketOrders: async () => null,
      notify,
    });
    await runForegroundPoll(deps);
    expect(saveMarketOrderState).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('persists a market-order snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedMarketOrders: MarketOrderPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      eventPrefsFor: async () => ({ marketOrderFilled: { browser: true } }),
      loadMarketOrders: async () => [
        { orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 },
      ],
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedMarketOrders).not.toBeNull();
    expect(savedMarketOrders![CHAR.characterId].entries).toEqual([
      { orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 },
    ]);
  });

  it('records marketOrderFilled to the feed but does not raise a browser notification by default (feed-only, CONTEXT.md round 45)', async () => {
    const savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: {
        entries: [{ orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const recordToFeed = vi.fn<PollDependencies['recordToFeed']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      feedChannelEnabled: async () => true,
      prevMarketOrderState: async () => savedMarketOrders,
      loadMarketOrders: async () => [
        { orderId: 1, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 },
      ],
      notify,
      recordToFeed,
    });
    await runForegroundPoll(deps);
    expect(recordToFeed).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('fires marketOrderFilled when an order newly transitions to filled', async () => {
    let savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: {
        entries: [{ orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      eventPrefsFor: async () => ({ marketOrderFilled: { browser: true } }),
      prevMarketOrderState: async () => savedMarketOrders,
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
      loadMarketOrders: async () => [
        { orderId: 1, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 },
      ],
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'marketOrderFilled',
      characterId: CHAR.characterId,
      orderId: 1,
      typeId: 34,
      quantity: 100,
    });
    expect(character).toEqual(CHAR);
  });

  it('names the item and the number of them sold', async () => {
    let savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: {
        entries: [{ orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 250 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      eventPrefsFor: async () => ({ marketOrderFilled: { browser: true } }),
      prevMarketOrderState: async () => savedMarketOrders,
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
      loadMarketOrders: async () => [
        { orderId: 1, filled: true, isBuyOrder: false, typeId: 34, quantity: 250 },
      ],
      notify,
    });

    await runForegroundPoll(deps);

    // Type 34 is Tritanium in the bundled SDE snapshot, so the name resolves
    // without an ESI round trip — the same path a real poll takes first.
    const [, , copy] = notify.mock.calls[0];
    expect(copy?.title).toBe('Sell order filled');
    expect(copy?.body).toBe('Someone bought 250 x Tritanium from Test Pilot.');
  });

  it('leaves the count out when a single unit sold — "1 x" is noise', async () => {
    let savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: {
        entries: [{ orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 1 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      eventPrefsFor: async () => ({ marketOrderFilled: { browser: true } }),
      prevMarketOrderState: async () => savedMarketOrders,
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
      loadMarketOrders: async () => [
        { orderId: 1, filled: true, isBuyOrder: false, typeId: 34, quantity: 1 },
      ],
      notify,
    });

    await runForegroundPoll(deps);

    expect(notify.mock.calls[0][2]?.body).toBe('Someone bought Tritanium from Test Pilot.');
  });

  it('still delivers when the item name cannot be resolved', async () => {
    let savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: {
        entries: [{ orderId: 1, filled: false, isBuyOrder: false, typeId: 99999, quantity: 5 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      eventPrefsFor: async () => ({ marketOrderFilled: { browser: true } }),
      prevMarketOrderState: async () => savedMarketOrders,
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
      loadMarketOrders: async () => [
        { orderId: 1, filled: true, isBuyOrder: false, typeId: 99999, quantity: 5 },
      ],
      notify,
    });

    await runForegroundPoll(deps);

    // An id we cannot name is no reason to hold the notification back — the
    // same best-effort rule the EVE-notification copy follows.
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][2]?.body).toBe('Someone bought 5 x #99999 from Test Pilot.');
  });

  it('says nothing when a buy order fills — that is the trade you set up, not news', async () => {
    let savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: {
        entries: [{ orderId: 2, filled: false, isBuyOrder: true, typeId: 34, quantity: 100 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const recordToFeed = vi.fn<PollDependencies['recordToFeed']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      eventPrefsFor: async () => ({ marketOrderFilled: { browser: true, feed: true } }),
      prevMarketOrderState: async () => savedMarketOrders,
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
      loadMarketOrders: async () => [
        { orderId: 2, filled: true, isBuyOrder: true, typeId: 34, quantity: 100 },
      ],
      notify,
      recordToFeed,
    });

    await runForegroundPoll(deps);

    // Neither channel: the buy side is filtered in the diff, so nothing
    // downstream ever sees a fire to deliver.
    expect(notify).not.toHaveBeenCalled();
    expect(recordToFeed).not.toHaveBeenCalled();
  });

  it('groups several marketOrderFilled fires from the same poll into one notify call, since none name the order (issue: duplicate order-filled toasts)', async () => {
    let savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: {
        entries: [
          { orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 },
          { orderId: 2, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 },
          { orderId: 3, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 },
        ],
        nowMs: 1000,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      eventPrefsFor: async () => ({ marketOrderFilled: { browser: true } }),
      prevMarketOrderState: async () => savedMarketOrders,
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
      loadMarketOrders: async () => [
        { orderId: 1, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 },
        { orderId: 2, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 },
        { orderId: 3, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 },
      ],
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character, override] = notify.mock.calls[0];
    expect(fire.eventId).toBe('marketOrderFilled');
    expect(character).toEqual(CHAR);
    expect(override?.title).toContain('x3');
  });

  it('does not group the feed the way it groups the browser toast — one row per occurrence, each with its own Occurrence Key', async () => {
    let savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: {
        entries: [
          { orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 },
          { orderId: 2, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 },
        ],
        nowMs: 1000,
      },
    };
    const recordToFeed = vi.fn<PollDependencies['recordToFeed']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      feedChannelEnabled: async () => true,
      prevMarketOrderState: async () => savedMarketOrders,
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
      loadMarketOrders: async () => [
        { orderId: 1, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 },
        { orderId: 2, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 },
      ],
      recordToFeed,
    });
    await runForegroundPoll(deps);
    // Two distinct occurrences (orders 1 and 2) -> two feed rows, even though
    // they'd collapse into one browser toast — losing either row here would
    // permanently drop that occurrence's history, since the diff that
    // produced it is already high-water-marked and will never re-fire.
    expect(recordToFeed).toHaveBeenCalledTimes(2);
  });

  it('does not group fires whose rendered copy actually differs (a different Character each firing marketOrderFilled once)', async () => {
    const CHAR_2: CharacterRef = { characterId: 2, name: 'Second Pilot' };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const marketOrderStates: Record<number, MarketOrderPollerState[number]> = {
      1: {
        entries: [{ orderId: 1, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 }],
        nowMs: 1000,
      },
      2: {
        entries: [{ orderId: 9, filled: false, isBuyOrder: false, typeId: 34, quantity: 100 }],
        nowMs: 1000,
      },
    };
    const deps = baseDeps({
      characters: async () => [CHAR, CHAR_2],
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      eventPrefsFor: async () => ({ marketOrderFilled: { browser: true } }),
      prevMarketOrderState: async () => marketOrderStates,
      saveMarketOrderState: async (state) => {
        Object.assign(marketOrderStates, state);
      },
      loadMarketOrders: async (characterId) =>
        characterId === 1
          ? [{ orderId: 1, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 }]
          : [{ orderId: 9, filled: true, isBuyOrder: false, typeId: 34, quantity: 100 }],
      notify,
    });
    await runForegroundPoll(deps);
    // Different Characters -> different rendered copy ("X's market order was
    // filled." vs "Y's..."), so each stays its own delivery rather than
    // collapsing across characters.
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('skips eveNotification for a character with no granted scope', async () => {
    const loadEveNotifications = vi.fn(async () => []);
    const deps = baseDeps({ loadEveNotifications });
    await runForegroundPoll(deps);
    expect(loadEveNotifications).not.toHaveBeenCalled();
  });

  it('skips eveNotification for a character who toggled the event off despite having the scope', async () => {
    const loadEveNotifications = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, NOTIFICATIONS_SCOPE]),
      eventPrefsFor: async () => ({ eveNotification: false }),
      loadEveNotifications,
    });
    await runForegroundPoll(deps);
    expect(loadEveNotifications).not.toHaveBeenCalled();
  });

  it('persists an eveNotification snapshot on the first poll but fires nothing (AC5, no baseline yet)', async () => {
    let saved: EveNotificationPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, NOTIFICATIONS_SCOPE]),
      loadEveNotifications: async () => [eveNotification({ notification_id: 5 })],
      saveEveNotificationState: async (state) => {
        saved = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(saved).not.toBeNull();
    expect(saved![CHAR.characterId].entries).toEqual([
      {
        notificationId: 5,
        type: 'BillOutOfMoneyMsg',
        senderId: 1000132,
        senderType: 'corporation',
        text: 'amount: 12345\n',
        timestamp: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('fires eveNotification when a notification id above the previous high-water mark appears (delivered to feed, its per-type default channel)', async () => {
    const recordToFeed = vi.fn<PollDependencies['recordToFeed']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, NOTIFICATIONS_SCOPE]),
      feedChannelEnabled: async () => true,
      prevEveNotificationState: async () => ({
        [CHAR.characterId]: {
          entries: [
            {
              notificationId: 5,
              type: 'BillOutOfMoneyMsg',
              senderId: 1000132,
              senderType: 'corporation',
              text: '',
              timestamp: '2026-01-01T00:00:00Z',
            },
          ],
          nowMs: 500,
        },
      }),
      loadEveNotifications: async () => [
        eveNotification({ notification_id: 6, type: 'AllWarDeclaredMsg' }),
        eveNotification({ notification_id: 5 }),
      ],
      recordToFeed,
    });
    await runForegroundPoll(deps);
    expect(recordToFeed).toHaveBeenCalledTimes(1);
    const [fire, character] = recordToFeed.mock.calls[0];
    expect(fire).toEqual(
      expect.objectContaining({
        eventId: 'eveNotification',
        characterId: CHAR.characterId,
        notificationId: 6,
        type: 'AllWarDeclaredMsg',
      })
    );
    expect(character).toEqual(CHAR);
  });

  it('drops a notification type that is not on the allow-list before it reaches either channel, without throwing (AC1/AC2)', async () => {
    const recordToFeed = vi.fn<PollDependencies['recordToFeed']>(async () => {});
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, NOTIFICATIONS_SCOPE]),
      feedChannelEnabled: async () => true,
      prevEveNotificationState: async () => ({
        [CHAR.characterId]: { entries: [], nowMs: 500 },
      }),
      loadEveNotifications: async () => [
        eveNotification({ notification_id: 1, type: 'SomeBrandNewMsgType6041' }),
      ],
      recordToFeed,
      notify,
    });
    await expect(runForegroundPoll(deps)).resolves.not.toThrow();
    expect(recordToFeed).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('opts an individual EVE notification type out of a channel without touching the parent event (AC3)', async () => {
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const recordToFeed = vi.fn<PollDependencies['recordToFeed']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, NOTIFICATIONS_SCOPE]),
      feedChannelEnabled: async () => true,
      // The type-level opt-out, not the event-level one.
      eveTypePrefsFor: async () => ({ BillOutOfMoneyMsg: { feed: false } }),
      prevEveNotificationState: async () => ({
        [CHAR.characterId]: { entries: [], nowMs: 500 },
      }),
      loadEveNotifications: async () => [
        eveNotification({ notification_id: 1, type: 'BillOutOfMoneyMsg' }),
        eveNotification({ notification_id: 2, type: 'AllWarDeclaredMsg' }),
      ],
      notify,
      recordToFeed,
    });
    await runForegroundPoll(deps);
    // Browser stays off (feed-only default), feed gets only the type that
    // wasn't opted out.
    expect(notify).not.toHaveBeenCalled();
    expect(recordToFeed).toHaveBeenCalledTimes(1);
    const [fire] = recordToFeed.mock.calls[0];
    expect(fire).toEqual(expect.objectContaining({ type: 'AllWarDeclaredMsg' }));
  });
});

describe('runForegroundPoll delivery channels', () => {
  /** A poll whose skill queue went empty between two polls: fires characterNotTraining once. */
  function firingDeps(
    overrides: Partial<PollDependencies> & DomainOverrides = {}
  ): PollDependencies {
    return baseDeps({
      now: () => 3000,
      prevState: async () => ({
        [CHAR.characterId]: {
          entries: [{ skillId: 100, finishedLevel: 1, queuePosition: 0, finishMs: 2000 }],
          nowMs: 1000,
        },
      }),
      loadSkillQueue: async () => [],
      ...overrides,
    });
  }

  it('records to the feed and shows a browser notification when both channels are on', async () => {
    const deps = firingDeps({ feedChannelEnabled: async () => true });
    await runForegroundPoll(deps);
    expect(deps.recordToFeed).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });

  it('still fills the feed when browser permission was never granted (the iOS case)', async () => {
    const deps = firingDeps({
      feedChannelEnabled: async () => true,
      permission: () => 'denied',
    });
    await runForegroundPoll(deps);
    expect(deps.recordToFeed).toHaveBeenCalledTimes(1);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('still fills the feed when the browser channel is switched off in settings', async () => {
    const deps = firingDeps({
      feedChannelEnabled: async () => true,
      browserChannelEnabled: async () => false,
    });
    await runForegroundPoll(deps);
    expect(deps.recordToFeed).toHaveBeenCalledTimes(1);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('notifies without recording when only the browser channel is on', async () => {
    const deps = firingDeps({ feedChannelEnabled: async () => false });
    await runForegroundPoll(deps);
    expect(deps.recordToFeed).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });

  it('makes no ESI calls when both channels are off', async () => {
    const characters = vi.fn(async () => [CHAR]);
    const deps = firingDeps({
      characters,
      browserChannelEnabled: async () => false,
      feedChannelEnabled: async () => false,
    });
    await runForegroundPoll(deps);
    expect(characters).not.toHaveBeenCalled();
  });

  it('leaves an in-progress poll alone rather than starting a second one, so an overlapping trigger cannot double-record the same fire', async () => {
    // firingDeps' baseline is static (not persisted between calls), so two
    // independent runs would each fire once on their own — this only stays
    // at one call if the second `runForegroundPoll` reuses the first's
    // still-running promise instead of starting its own poll.
    const deps = firingDeps({ feedChannelEnabled: async () => true });
    const first = runForegroundPoll(deps);
    const second = runForegroundPoll(deps);
    await Promise.all([first, second]);
    expect(deps.recordToFeed).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh poll once the previous one has finished', async () => {
    const deps = firingDeps({ feedChannelEnabled: async () => true });
    await runForegroundPoll(deps);
    await runForegroundPoll(deps);
    expect(deps.recordToFeed).toHaveBeenCalledTimes(2);
  });
});

describe('runForegroundPoll browser suppression against pushed occurrences (issue #360)', () => {
  /** A poll whose skill queue went empty between two polls: fires characterNotTraining once. */
  function firingDeps(
    overrides: Partial<PollDependencies> & DomainOverrides = {}
  ): PollDependencies {
    return baseDeps({
      now: () => 3000,
      prevState: async () => ({
        [CHAR.characterId]: {
          entries: [{ skillId: 100, finishedLevel: 1, queuePosition: 0, finishMs: 2000 }],
          nowMs: 1000,
        },
      }),
      loadSkillQueue: async () => [],
      ...overrides,
    });
  }

  it('does not raise a browser notification for an occurrence the feed already has (AC1)', async () => {
    const deps = firingDeps({ alreadyDelivered: async () => true });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('still raises a browser notification for an occurrence the feed does not have (AC2)', async () => {
    const deps = firingDeps({ alreadyDelivered: async () => false });
    await runForegroundPoll(deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });

  it('checks by Occurrence Key, not by rendered title/body (AC3)', async () => {
    const alreadyDelivered = vi.fn(async () => false);
    const deps = firingDeps({ alreadyDelivered });
    await runForegroundPoll(deps);
    expect(alreadyDelivered).toHaveBeenCalledWith(
      occurrenceKey(
        {
          eventId: 'characterNotTraining',
          characterId: CHAR.characterId,
          skillId: null,
          level: null,
          finishMs: null,
        },
        deps.now()
      )
    );
  });

  it('does not suppress a new occurrence that lands in a different day bucket than a previously-delivered one (AC4)', async () => {
    // Same event/character, but `now` (and so the day bucket the Occurrence
    // Key derives from) has moved on — `alreadyDelivered` reflects that by
    // only recognizing the earlier key, proving the poller still asks per
    // poll rather than caching a permanent "already handled" verdict.
    const earlierKey = occurrenceKey(
      {
        eventId: 'characterNotTraining',
        characterId: CHAR.characterId,
        skillId: null,
        level: null,
        finishMs: null,
      },
      3000
    );
    const deps = firingDeps({
      now: () => 86_400_000 + 3000,
      alreadyDelivered: async (key) => key === earlierKey,
    });
    await runForegroundPoll(deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });

  it('still raises a browser notification for an occurrence this same poll also just recorded to the feed, when both channels are on', async () => {
    // `recordToFeed` and `alreadyDelivered` share one backing store here, the
    // way `liveDependencies()` wires them both against `db.notificationFeed`
    // — this is what catches the poller checking `alreadyDelivered` *after*
    // its own feed loop already wrote the row for this exact occurrence,
    // which would make every occurrence with both channels on (the default
    // for every event but `eveNotification`'s sub-types) look
    // self-delivered and wrongly suppress its own first browser toast.
    const delivered = new Set<string>();
    const deps = firingDeps({
      feedChannelEnabled: async () => true,
      recordToFeed: vi.fn(async (fire) => {
        delivered.add(occurrenceKey(fire, deps.now()));
      }),
      alreadyDelivered: vi.fn(async (key) => delivered.has(key)),
    });
    await runForegroundPoll(deps);
    expect(deps.recordToFeed).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });
});

describe('runForegroundPoll per-event channel columns', () => {
  function firingDeps(
    overrides: Partial<PollDependencies> & DomainOverrides = {}
  ): PollDependencies {
    return baseDeps({
      now: () => 3000,
      feedChannelEnabled: async () => true,
      prevState: async () => ({
        [CHAR.characterId]: {
          entries: [{ skillId: 100, finishedLevel: 1, queuePosition: 0, finishMs: 2000 }],
          nowMs: 1000,
        },
      }),
      loadSkillQueue: async () => [],
      ...overrides,
    });
  }

  it('records to the feed only, for an event switched off in the browser column', async () => {
    const deps = firingDeps({
      eventPrefsFor: async () => ({ characterNotTraining: { browser: false } }),
    });
    await runForegroundPoll(deps);
    expect(deps.recordToFeed).toHaveBeenCalledTimes(1);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('notifies only, for an event switched off in the list column', async () => {
    const deps = firingDeps({
      eventPrefsFor: async () => ({ characterNotTraining: { feed: false } }),
    });
    await runForegroundPoll(deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.recordToFeed).not.toHaveBeenCalled();
  });

  it('makes no ESI call for an event switched off in both columns', async () => {
    const loadSkillQueue = vi.fn(async () => []);
    const deps = firingDeps({
      loadSkillQueue,
      eventPrefsFor: async () => ({
        skillLevelComplete: { browser: false, feed: false },
        characterNotTraining: { browser: false, feed: false },
      }),
    });
    await runForegroundPoll(deps);
    expect(loadSkillQueue).not.toHaveBeenCalled();
  });

  it('honours a legacy bare-boolean pref as off on both columns', async () => {
    const loadSkillQueue = vi.fn(async () => []);
    const deps = firingDeps({
      loadSkillQueue,
      eventPrefsFor: async () => ({ skillLevelComplete: false, characterNotTraining: false }),
    });
    await runForegroundPoll(deps);
    expect(loadSkillQueue).not.toHaveBeenCalled();
  });
});

describe('runForegroundPoll Scheduled Push upload (issue #358)', () => {
  it('uploads projection rows built from this poll’s snapshot', async () => {
    const uploadProjection = vi.fn<PollDependencies['uploadProjection']>(async () => {});
    const now = 1_000_000;
    const startMs = now + 1000; // within the 72-hour Projection Horizon
    const deps = baseDeps({
      now: () => now,
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, CALENDAR_SCOPE]),
      eventPrefsFor: async () => ({ calendarEventStarting: true }),
      loadCalendarEvents: async () => [
        calendarEvent({ event_id: 5, event_date: new Date(startMs).toISOString() }),
      ],
      uploadProjection,
    });
    await runForegroundPoll(deps);

    expect(uploadProjection).toHaveBeenCalledTimes(1);
    const [rowsByCharacter] = uploadProjection.mock.calls[0];
    expect(rowsByCharacter.get(CHAR.characterId)).toEqual([
      expect.objectContaining({ eventId: 'calendarEventStarting', characterId: CHAR.characterId }),
    ]);
  });

  it('excludes a character this poll did not touch (no granted scope at all) from the upload map', async () => {
    const charB: CharacterRef = { characterId: 2, name: 'Second Pilot' };
    const uploadProjection = vi.fn<PollDependencies['uploadProjection']>(async () => {});
    const deps = baseDeps({
      characters: async () => [CHAR, charB],
      grantedScopes: async (characterId) =>
        characterId === CHAR.characterId ? new Set([SKILLQUEUE_SCOPE]) : new Set(),
      uploadProjection,
    });
    await runForegroundPoll(deps);

    expect(uploadProjection).toHaveBeenCalledTimes(1);
    const [rowsByCharacter] = uploadProjection.mock.calls[0];
    expect(rowsByCharacter.has(CHAR.characterId)).toBe(true);
    expect(rowsByCharacter.has(charB.characterId)).toBe(false);
  });

  it('does not upload at all when the poll does nothing (master switch off)', async () => {
    const uploadProjection = vi.fn<PollDependencies['uploadProjection']>(async () => {});
    const deps = baseDeps({ masterEnabled: async () => false, uploadProjection });
    await runForegroundPoll(deps);
    expect(uploadProjection).not.toHaveBeenCalled();
  });

  it('filters projection rows to the enabled events, even for a domain whose projection emits more than one event from one snapshot', async () => {
    // colonyDomain's projection always emits both planetaryExtractionDone and
    // planetaryExtractorExpiring rows from one snapshot regardless of which
    // is individually toggled — the poll's own live-fire gating already
    // relies on `enabledEvents`, and the projection upload must apply the
    // same filter rather than uploading a disabled event's row anyway.
    const now = 1_000_000;
    const expiryTimeMs = now + 20 * 3_600_000; // 20h out: extractionDone in horizon, and the 12h-lead extractorExpiring threshold in horizon too
    const uploadProjection = vi.fn<PollDependencies['uploadProjection']>(async () => {});
    const deps = baseDeps({
      now: () => now,
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, PLANETS_SCOPE]),
      eventPrefsFor: async () => ({
        planetaryExtractorExpiring: true,
        planetaryExtractionDone: false,
      }),
      loadColonyExtractors: async () => [
        { planetId: 4001, extractors: [{ pinId: 9001, expiryTimeMs }] },
      ],
      uploadProjection,
    });
    await runForegroundPoll(deps);

    expect(uploadProjection).toHaveBeenCalledTimes(1);
    const [rowsByCharacter] = uploadProjection.mock.calls[0];
    const rows = rowsByCharacter.get(CHAR.characterId) ?? [];
    expect(rows.map((row) => row.eventId)).toEqual(['planetaryExtractorExpiring']);
  });

  it('does not upload a row for an event switched to feed-only — a Scheduled Push shows an OS notification, same as the browser channel', async () => {
    // A Scheduled Push is the closed-app analog of the browser channel: it
    // always shows an OS popup (pushHandler.ts), never a silent feed write.
    // Uploading a feed-only event's row would bypass the user's own
    // browser-notifications-off choice the moment the app closes.
    const now = 1_000_000;
    const startMs = now + 1000;
    const uploadProjection = vi.fn<PollDependencies['uploadProjection']>(async () => {});
    const deps = baseDeps({
      now: () => now,
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, CALENDAR_SCOPE]),
      feedChannelEnabled: async () => true,
      eventPrefsFor: async () => ({ calendarEventStarting: { browser: false, feed: true } }),
      loadCalendarEvents: async () => [
        calendarEvent({ event_id: 5, event_date: new Date(startMs).toISOString() }),
      ],
      uploadProjection,
    });
    await runForegroundPoll(deps);

    expect(uploadProjection).toHaveBeenCalledTimes(1);
    const [rowsByCharacter] = uploadProjection.mock.calls[0];
    expect(rowsByCharacter.get(CHAR.characterId)).toEqual([]);
  });
});
