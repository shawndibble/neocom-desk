import { describe, it, expect, vi } from 'vitest';
import type {
  SkillQueueEntry,
  IndustryJob,
  MailHeader,
  CalendarEventSummary,
  Contract,
  WalletJournalEntry,
  MarketOrder,
  MarketOrderHistory,
} from '@/esi/endpoints';
import {
  runForegroundPoll,
  deriveMarketOrderEntries,
  type PollDependencies,
  type CharacterRef,
} from './foregroundPoller';
import type {
  SkillQueuePollerState,
  IndustryJobPollerState,
  ColonyPollerState,
  MailPollerState,
  CalendarPollerState,
  ContractPollerState,
  WalletPollerState,
  MarketOrderPollerState,
} from './pollerState';

const CHAR: CharacterRef = { characterId: 1, name: 'Test Pilot' };
const SKILLQUEUE_SCOPE = 'esi-skills.read_skillqueue.v1';
const INDUSTRY_JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';
const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';
const MAIL_SCOPE = 'esi-mail.read_mail.v1';
const CALENDAR_SCOPE = 'esi-calendar.read_calendar_events.v1';
const CONTRACTS_SCOPE = 'esi-contracts.read_character_contracts.v1';
const WALLET_SCOPE = 'esi-wallet.read_character_wallet.v1';
const MARKET_ORDERS_SCOPE = 'esi-markets.read_character_orders.v1';

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

function walletJournalEntry(overrides: Partial<WalletJournalEntry> = {}): WalletJournalEntry {
  return {
    id: 1,
    date: '2026-01-01T00:00:00Z',
    ref_type: 'bounty',
    description: '',
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

function baseDeps(overrides: Partial<PollDependencies> = {}): PollDependencies {
  let saved: SkillQueuePollerState = {};
  let savedJobs: IndustryJobPollerState = {};
  let savedColonies: ColonyPollerState = {};
  let savedMail: MailPollerState = {};
  let savedCalendar: CalendarPollerState = {};
  let savedContracts: ContractPollerState = {};
  let savedWallet: WalletPollerState = {};
  let savedMarketOrders: MarketOrderPollerState = {};
  return {
    now: () => 1_000_000,
    characters: async () => [CHAR],
    grantedScopes: async () => new Set([SKILLQUEUE_SCOPE]),
    loadSkillQueue: async () => [],
    loadIndustryJobs: async () => [],
    loadColonyExtractors: async () => [],
    loadMail: async () => [],
    loadCalendarEvents: async () => [],
    loadContracts: async () => [],
    loadWalletJournal: async () => [],
    loadMarketOrders: async () => [],
    masterEnabled: async () => true,
    eventPrefsFor: async () => ({}),
    permission: () => 'granted',
    prevState: async () => saved,
    saveState: async (state) => {
      saved = state;
    },
    prevIndustryJobState: async () => savedJobs,
    saveIndustryJobState: async (state) => {
      savedJobs = state;
    },
    prevColonyState: async () => savedColonies,
    saveColonyState: async (state) => {
      savedColonies = state;
    },
    prevMailState: async () => savedMail,
    saveMailState: async (state) => {
      savedMail = state;
    },
    prevCalendarState: async () => savedCalendar,
    saveCalendarState: async (state) => {
      savedCalendar = state;
    },
    prevContractState: async () => savedContracts,
    saveContractState: async (state) => {
      savedContracts = state;
    },
    prevWalletState: async () => savedWallet,
    saveWalletState: async (state) => {
      savedWallet = state;
    },
    prevMarketOrderState: async () => savedMarketOrders,
    saveMarketOrderState: async (state) => {
      savedMarketOrders = state;
    },
    notify: vi.fn(async () => {}),
    ...overrides,
  };
}

function marketOrder(overrides: Partial<MarketOrder> = {}): MarketOrder {
  return {
    order_id: 1,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    is_corporation: false,
    price: 100,
    volume_remain: 5,
    volume_total: 10,
    issued: '2026-01-01T00:00:00Z',
    duration: 90,
    range: 'region',
    ...overrides,
  };
}

function marketOrderHistoryEntry(overrides: Partial<MarketOrderHistory> = {}): MarketOrderHistory {
  return { ...marketOrder(), state: 'expired', ...overrides };
}

describe('deriveMarketOrderEntries', () => {
  it('marks every still-open order as not filled', () => {
    const entries = deriveMarketOrderEntries([marketOrder({ order_id: 1 })], []);
    expect(entries).toEqual([{ orderId: 1, filled: false }]);
  });

  it('marks a history order gone from the open list as filled once volume_remain is 0', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [marketOrderHistoryEntry({ order_id: 2, volume_remain: 0 })]
    );
    expect(entries).toEqual([{ orderId: 2, filled: true }]);
  });

  it('does not mark a history order with remaining volume as filled (cancelled/expired unfilled)', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [marketOrderHistoryEntry({ order_id: 3, volume_remain: 4 })]
    );
    expect(entries).toEqual([{ orderId: 3, filled: false }]);
  });

  it('prefers the open-list entry over a stale history row for the same order id', () => {
    const entries = deriveMarketOrderEntries(
      [marketOrder({ order_id: 4 })],
      [marketOrderHistoryEntry({ order_id: 4, volume_remain: 0 })]
    );
    expect(entries).toEqual([{ orderId: 4, filled: false }]);
  });

  it('derives the same shape for a filled buy order as a filled sell order', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [
        marketOrderHistoryEntry({ order_id: 5, is_buy_order: true, volume_remain: 0 }),
        marketOrderHistoryEntry({ order_id: 6, is_buy_order: false, volume_remain: 0 }),
      ]
    );
    expect(entries).toEqual([
      { orderId: 5, filled: true },
      { orderId: 6, filled: true },
    ]);
  });
});

describe('runForegroundPoll', () => {
  it('does nothing when the master switch is off', async () => {
    const characters = vi.fn(async () => [CHAR]);
    const deps = baseDeps({ masterEnabled: async () => false, characters });
    await runForegroundPoll(deps);
    expect(characters).not.toHaveBeenCalled();
  });

  it('does nothing without granted browser permission', async () => {
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

  it('skips planetary extraction for a character who toggled the event off despite having the scope', async () => {
    const loadColonyExtractors = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, PLANETS_SCOPE]),
      eventPrefsFor: async () => ({ planetaryExtractionDone: false }),
      loadColonyExtractors,
    });
    await runForegroundPoll(deps);
    expect(loadColonyExtractors).not.toHaveBeenCalled();
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

  it('persists a wallet snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedWallet: WalletPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, WALLET_SCOPE]),
      loadWalletJournal: async () => [walletJournalEntry({ id: 5, amount: 100 })],
      saveWalletState: async (state) => {
        savedWallet = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedWallet).not.toBeNull();
    expect(savedWallet![CHAR.characterId].entries).toEqual([{ id: 5, amount: 100 }]);
  });

  it('fires walletBalanceChanged when a journal entry id above the previous high-water mark appears', async () => {
    let savedWallet: WalletPollerState = {
      [CHAR.characterId]: { entries: [{ id: 5, amount: 100 }], nowMs: 1000 },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, WALLET_SCOPE]),
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

  it('persists a market-order snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedMarketOrders: MarketOrderPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      loadMarketOrders: async () => [{ orderId: 1, filled: false }],
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedMarketOrders).not.toBeNull();
    expect(savedMarketOrders![CHAR.characterId].entries).toEqual([{ orderId: 1, filled: false }]);
  });

  it('fires marketOrderFilled when an order newly transitions to filled', async () => {
    let savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: { entries: [{ orderId: 1, filled: false }], nowMs: 1000 },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      prevMarketOrderState: async () => savedMarketOrders,
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
      loadMarketOrders: async () => [{ orderId: 1, filled: true }],
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'marketOrderFilled',
      characterId: CHAR.characterId,
      orderId: 1,
    });
    expect(character).toEqual(CHAR);
  });

  it('fires marketOrderFilled the same way for a buy order as a sell order', async () => {
    let savedMarketOrders: MarketOrderPollerState = {
      [CHAR.characterId]: { entries: [{ orderId: 2, filled: false }], nowMs: 1000 },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, MARKET_ORDERS_SCOPE]),
      prevMarketOrderState: async () => savedMarketOrders,
      saveMarketOrderState: async (state) => {
        savedMarketOrders = state;
      },
      loadMarketOrders: async () => [{ orderId: 2, filled: true }],
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire] = notify.mock.calls[0];
    expect(fire.eventId).toBe('marketOrderFilled');
  });
});
