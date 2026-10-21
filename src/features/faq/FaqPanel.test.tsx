import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ARCHIVE_DAYS } from '@/engine/wallet/archiveCoverage';
import { AUTHORIZED_APPS_URL } from '@/lib/links';
import { REMOTE_COLLECTIONS } from '@/sync/syncedCollections';
import { SYNCED_SETTING_KEYS } from '@/sync/syncedSettings';
import { FaqPanel } from './FaqPanel';
import {
  COMMUNITY_COLLECTION_FAQ_ITEM,
  RETENTION_GROUPS,
  WHAT_WE_STORE_GROUPS,
} from './whatWeStore';

const QUESTIONS = 19;

/** Renders the FAQ with every question opened, as the content tests read the answers. */
function renderFaq(initialEntry = '/help/faq') {
  const result = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FaqPanel />
    </MemoryRouter>
  );
  for (const question of questionButtons()) fireEvent.click(question);
  return result;
}

function questionButtons(): HTMLElement[] {
  return screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-expanded'));
}

/**
 * Which words in the "settings" line account for each allow-listed synced key.
 * The line covers all of them at once, so it is the phrasing rather than the
 * bullet that has to keep up.
 */
const SETTING_KEY_TO_PHRASE: Readonly<Record<string, RegExp>> = {
  'sync.notificationFeedPrefs': /notification preferences/i,
  'sync.piCustomsRates': /customs rate overrides/i,
  'sync.structureBrokerFees': /structure broker fees/i,
  'sync.marketHub': /trade hub/i,
  'sync.marketPricePercent': /appraisal price %/i,
  'sync.industryFacilityDefaults': /industry facility/i,
  'sync.industryReactionFacilityDefaults': /reaction facility/i,
  'sync.industryAssumedMe': /assumed ME\/TE/,
  'sync.industryAssumedTe': /assumed ME\/TE/,
  'sync.industryBuildGroups': /build groups/i,
  'sync.piExpiringSoonHours': /expiring-soon window/i,
  'sync.corpDarkAfterDays': /dark threshold/i,
  'sync.defaultCharacterFilter': /default characters shown/i,
  'sync.spExtractionMonitoringEnabled': /SP Extraction monitoring/i,
  'sync.spExtractionThresholdSp': /SP Extraction monitoring and its threshold/i,
  'sync.loyaltyLpValue': /ISK-per-LP value/i,
  'sync.fittingDamageProfiles': /damage and target profiles/i,
  'sync.fittingDamageProfileId': /which ones are active/i,
  'sync.fittingTargetProfiles': /damage and target profiles/i,
  'sync.fittingTargetProfileId': /which ones are active/i,
  'sync.skillCloneStates': /Alpha\/Omega/i,
  'sync.cloneNicknames': /names you gave your jump clones/i,
  'sync.miningTaxManualMoonOreTypeIds': /ore types you tagged/i,
  'sync.miningTaxManualIgnoredTypeIds': /ore types you tagged/i,
  'sync.miningTaxCompressedOre': /compressed ore/i,
  'sync.oreRefiningStructureRate': /refining rate you type/i,
  'sync.surveyHistory': /survey links you created or opened/i,
  'sync.surveyInfoTemplates': /info templates/i,
  'sync.stockLists': /markets you stock/i,
  'sync.miningTaxOreValueMode': /Assign form edits ore values/i,
  'sync.courierHighCollateralRatio': /courier collateral warning/i,
  'sync.bpcHideAuctions': /hide auctions/i,
  'sync.bpcHidePlex': /hide PLEX/i,
  'sync.targetSkillPlan': /target skill plan/i,
  'sync.overviewHiddenCards': /hidden and reordered Overview cards/i,
  'sync.navHidden': /pages hidden from the navigation/i,
  'sync.navSetupAnswered': /answered the rail question/i,
  'sync.overviewCardOrder': /hidden and reordered Overview cards/i,
  'sync.overviewLayout': /your Overview layout/i,
  'sync.avoidedSystems': /avoided systems/i,
  'sync.systemNotes': /notes you wrote on solar systems/i,
  'sync.avoidedSystemsEnabled': /whether the list is on/i,
  'sync.routeHoles': /through Thera \/ Turnur/i,
  'sync.routeHoleShipSize': /ship size/i,
  'sync.routeHoleMinLife': /minimum hole life/i,
  'sync.routeHoleHubs': /which hubs/i,
  'sync.routePreference': /route preference/i,
  'sync.routeSecurityPenalty': /security penalty/i,
  'sync.avoidEdencom': /EDENCOM/,
  'sync.avoidTriglavian': /Triglavian/,
  'sync.avoidPodKills': /pod-kill/i,
  'sync.podKillThreshold': /with your threshold/i,
};

function syncedItemIds(): Set<string> {
  const group = WHAT_WE_STORE_GROUPS.find((g) => g.id === 'synced');
  return new Set(group?.items.map((item) => item.id) ?? []);
}

/** The always-open sub-list under the "find skills to train" question. */
const TRAIN_SKILLS_STEPS = 6;

describe('FaqPanel — What We Store', () => {
  // Which line accounts for each remote collection is declared on the
  // collection itself (`faqItem` in sync/syncedCollections.ts), a required
  // field — so a new synced collection cannot be declared without whoever
  // adds it deciding what the pilot is told. Several collections share one
  // line on purpose ("Production Runs, and the sales and orders you linked").
  it('accounts for every collection that actually leaves the device', () => {
    const ids = syncedItemIds();
    for (const collection of REMOTE_COLLECTIONS) {
      expect(ids, `${collection.remoteName} maps to a line that no longer exists`).toContain(
        collection.faqItem
      );
    }
  });

  it('keeps the synced lines in the order the pilot reads them', () => {
    const group = WHAT_WE_STORE_GROUPS.find((g) => g.id === 'synced');
    expect(group?.items.map((item) => item.id)).toEqual([
      'skillPlans',
      'buildPlans',
      'productionRuns',
      'quickbar',
      'stationPins',
      'piPicks',
      'miningTax',
      'fittings',
      'netWorthSnapshots',
      'notificationFeed',
      'settings',
    ]);
  });

  it('files Community data as its own third group, after the other two', () => {
    expect(WHAT_WE_STORE_GROUPS.map((group) => group.id)).toEqual([
      'synced',
      'local',
      'communities',
    ]);
  });

  it('has no synced line that no longer corresponds to anything stored', () => {
    // The other direction: a collection removed from sync must not leave the
    // user told we still hold it. `settings` is the one line covering both
    // synced setting keys, so it is expected on both sides.
    const claimed = new Set<string>(REMOTE_COLLECTIONS.map((c) => c.faqItem));
    for (const id of syncedItemIds()) {
      expect(claimed, `"${id}" is listed as synced but maps to no collection`).toContain(id);
    }
  });

  it('names every setting that leaves the device', () => {
    // The settings line used to name a count, which stopped scaling the moment
    // a third preference synced. What has to stay true is the promise it ends
    // on — "nothing else on this page leaves your device" — so each allowed key
    // is pinned to the words that account for it, in the same two-file spirit
    // as `syncedSettings.ts`: adding a key fails this until whoever added it
    // decides what the reader is told.
    renderFaq();
    const shown = document.body.textContent ?? '';
    for (const key of SYNCED_SETTING_KEYS) {
      const phrase = SETTING_KEY_TO_PHRASE[key];
      expect(phrase, `"${key}" syncs but no words in the FAQ account for it`).toBeDefined();
      expect(shown, `"${key}" syncs but the FAQ never mentions it`).toMatch(phrase);
    }
  });

  it('lists the questions closed, so the page reads as a list to scan', () => {
    render(
      <MemoryRouter>
        <FaqPanel />
      </MemoryRouter>
    );
    const questions = questionButtons();
    expect(questions).toHaveLength(QUESTIONS);
    for (const question of questions) expect(question).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'How do I delete my data?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How do I force an update?' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'How do I install Neocom Desk as an app?' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'What notifications arrive when the app is closed?' })
    ).toBeInTheDocument();
  });

  it('renders every group and every line once opened', () => {
    renderFaq();

    const items = WHAT_WE_STORE_GROUPS.flatMap((g) => g.items);
    const lines =
      QUESTIONS +
      TRAIN_SKILLS_STEPS +
      RETENTION_GROUPS.reduce((sum, g) => sum + g.items.length, 0) +
      items.length +
      items.reduce((sum, item) => sum + (item.detailKeys?.length ?? 0), 0);
    expect(screen.getAllByRole('listitem')).toHaveLength(lines);
  });

  it('answers the how-to questions with where to go', () => {
    renderFaq();
    expect(
      screen.getByText(/Delete all data removes every Character's synced data/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Update now/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Alerts with a known time.*a contract or market order about to expire.*Community alerts, needs the app open/
      )
    ).toBeInTheDocument();
  });

  it('has no group listing things we do not hold', () => {
    // Dropped on purpose: a list of what is *not* stored is unfalsifiable by
    // the reader and unbounded by nature. The two groups account for what
    // exists; absence from both is the answer.
    expect(WHAT_WE_STORE_GROUPS).toHaveLength(3);
    renderFaq();
    expect(screen.queryByRole('heading', { name: /never collected/i })).not.toBeInTheDocument();
  });

  it('states the cases where something does leave the device', () => {
    // The section is worth less than nothing if it overclaims. These three are
    // the real exceptions, and each is named rather than implied.
    renderFaq();

    expect(screen.getByText(/push notifications, if on/i)).toBeInTheDocument();
    expect(screen.getByText(/crash reports: the error/i)).toBeInTheDocument();
    expect(screen.getByText(/writes to EVE, only when you act/i)).toBeInTheDocument();
    expect(
      screen.getByText(/removing a character clears it from this device only/i)
    ).toBeInTheDocument();
  });

  it('says when a removed character’s synced copy actually leaves our servers', () => {
    // Removal is local-only; the remote docs go with the
    // `purgeStaleAccounts` inactivity purge. Saying "removed means deleted"
    // would be the one outright false sentence in the section.
    renderFaq();
    expect(
      screen.getByText(/deleted after 90 days with no device syncing it/i)
    ).toBeInTheDocument();
  });

  it('does not claim EVE data is uploaded', () => {
    renderFaq();
    expect(
      screen.getByText(/is not uploaded, apart from what you choose to share/i)
    ).toBeInTheDocument();
    // The intro used to say EVE data "stays on this device" without exception.
    expect(screen.getByText(/exceptions, listed below/i)).toBeInTheDocument();
  });

  it('points to the Help page’s Support tab', () => {
    renderFaq();
    const link = screen.getByRole('link', { name: /support/i });
    expect(link).toHaveAttribute('href', '/help/support');
  });
});

describe('FaqPanel: Communities', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const COMMUNITY_MATCH = 'match /communities/{communityId} {';
  // Everything between the shared Community block and the collection-group
  // read rule that follows it (the per-Character `communities` index is in
  // the characters block, before it).
  const communityBlock = rules.slice(
    rules.indexOf(COMMUNITY_MATCH, rules.indexOf('Communities (issue #3596, ADR 0018)')),
    rules.indexOf('match /{path=**}/pledges/')
  );

  it('maps every collection the rules let Communities use to a line the pilot is told', () => {
    const names = [...communityBlock.matchAll(/match \/(\w+)\/\{\w+\}/g)]
      .map((match) => match[1])
      // The block's own `communities/{communityId}` line.
      .filter((name) => name !== 'communities');
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) {
      expect(
        COMMUNITY_COLLECTION_FAQ_ITEM,
        `"${name}" is a Community collection in firestore.rules with no line in the FAQ`
      ).toHaveProperty(name);
    }
    for (const name of ['communities', 'mailInviteQuota', 'requestMailQuota']) {
      expect(rules).toContain(`match /${name}/{`);
    }
  });

  it('has a line for every mapped collection, and no line that nothing maps to', () => {
    const group = WHAT_WE_STORE_GROUPS.find((g) => g.id === 'communities');
    const ids = new Set(group?.items.map((item) => item.id));
    const mapped = new Set<string>(Object.values(COMMUNITY_COLLECTION_FAQ_ITEM));
    expect(ids).toEqual(mapped);
  });

  it('tells the pilot what Members can read, in its own answer', () => {
    renderFaq();
    expect(screen.getByText(/Every Member of that Community can read it/)).toBeInTheDocument();
    expect(screen.getByText(/Never containers, hangars or item IDs/)).toBeInTheDocument();
    expect(screen.getByText(/IDs of the contracts behind it/)).toBeInTheDocument();
  });

  it('says Delete all data can leave your Communities, and how a Community goes', () => {
    renderFaq();
    expect(
      screen.getByText(/Delete all data also offers to leave your Communities/)
    ).toBeInTheDocument();
    expect(screen.getByText(/A Community's admin can't leave/)).toBeInTheDocument();
  });

  it('keeps the wallet archive retention equal to the days the archive prunes at', () => {
    expect(ARCHIVE_DAYS).toBe(365);
    renderFaq();
    expect(document.body.textContent).toMatch(/Wallet journal and transactions:\s*one year\./);
  });

  it('keeps the Community retention numbers equal to the code that enforces them', () => {
    const functions = (file: string) =>
      readFileSync(resolve(process.cwd(), 'functions/src', file), 'utf8');
    const requests = functions('communityRequests.ts');
    const days = (name: string) =>
      Number(new RegExp(`${name} = (\\d+) \\* 24`).exec(requests)?.[1]);
    expect(days('REQUEST_LIFETIME_MS')).toBe(30);
    expect(days('CLOSED_RETENTION_MS')).toBe(7);
    expect(days('EXPIRED_RETENTION_MS')).toBe(7);
    expect(functions('purgeStaleAccounts.ts')).toMatch(/ACCOUNT_INACTIVITY_DAYS = 90/);
    const server = RETENTION_GROUPS.find((group) => group.id === 'server');
    const text = (id: string) => {
      const item = server?.items.find((candidate) => candidate.id === id);
      return `${item?.labelKey} ${item?.durationKey}`;
    };
    renderFaq();
    const shown = document.body.textContent ?? '';
    expect(text('communityRequests')).toContain('communityRequests');
    expect(shown).toMatch(/30 days after posting or your last Extend, then 7 more days/);
    expect(shown).toMatch(/closed Request is deleted 7 days after it closes/);
    expect(shown).toMatch(
      /90 days, then all of its synced data is deleted and the Character is removed/
    );
  });
});

describe('FaqPanel: Using Neocom Desk', () => {
  it('answers the how-to questions, each with an anchor to link to', () => {
    renderFaq();
    for (const id of [
      'permissions',
      'data-lag',
      'alerts',
      'characters',
      'phone',
      'install',
      'update',
      'train-skills',
      'communities',
    ]) {
      expect(document.getElementById(id), `#${id}`).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Using Neocom Desk' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your data' })).toBeInTheDocument();
  });

  it('points the permissions answer at EVE’s authorized-apps page', () => {
    renderFaq();
    expect(screen.getByRole('link', { name: /authorized apps page/i })).toHaveAttribute(
      'href',
      AUTHORIZED_APPS_URL
    );
  });

  it('opens only the named question when linked to with an anchor', () => {
    render(
      <MemoryRouter initialEntries={['/help/faq#data-lag']}>
        <FaqPanel />
      </MemoryRouter>
    );
    const open = questionButtons().filter((b) => b.getAttribute('aria-expanded') === 'true');
    expect(open.map((button) => button.textContent)).toEqual([
      'Why do my numbers differ from, or lag behind, the game?',
    ]);
  });
});
