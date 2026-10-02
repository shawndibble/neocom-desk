import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { REMOTE_COLLECTIONS } from '@/sync/syncedCollections';
import { SYNCED_SETTING_KEYS } from '@/sync/syncedSettings';
import { FaqPanel } from './FaqPanel';
import { WHAT_WE_STORE_GROUPS } from './whatWeStore';

const QUESTIONS = 8;

/** Renders the FAQ with every question opened, as the content tests read the answers. */
function renderFaq() {
  const result = render(
    <MemoryRouter>
      <FaqPanel />
    </MemoryRouter>
  );
  for (const question of questionButtons()) fireEvent.click(question);
  return result;
}

function questionButtons(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'FAQ' }))
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-expanded'));
}

/**
 * Which words in the "settings" line account for each allow-listed synced key.
 * The line covers all of them at once, so it is the phrasing rather than the
 * bullet that has to keep up.
 */
const SETTING_KEY_TO_PHRASE: Readonly<Record<string, RegExp>> = {
  'sync.notificationFeedPrefs': /notification preferences/i,
  'sync.piCustomsRates': /customs rate overrides/i,
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
  'sync.industryIncludeBlueprintCost': /blueprint cost counts toward profit/i,
  'sync.loyaltyLpValue': /ISK-per-LP value/i,
  'sync.fittingDamageProfiles': /damage and target profiles/i,
  'sync.fittingDamageProfileId': /which ones are active/i,
  'sync.fittingTargetProfiles': /damage and target profiles/i,
  'sync.fittingTargetProfileId': /which ones are active/i,
  'sync.skillCloneStates': /Alpha\/Omega/i,
  'sync.miningTaxManualMoonOreTypeIds': /ore types you tagged/i,
  'sync.miningTaxManualIgnoredTypeIds': /ore types you tagged/i,
  'sync.miningTaxOreValueMode': /Assign form edits ore values/i,
  'sync.courierHighCollateralRatio': /courier collateral warning/i,
  'sync.bpcHideAuctions': /hide auctions/i,
  'sync.bpcHidePlex': /hide PLEX/i,
  'sync.targetSkillPlan': /target skill plan/i,
  'sync.overviewHiddenCards': /hidden and reordered Overview cards/i,
  'sync.navHidden': /pages hidden from the navigation/i,
  'sync.overviewCardOrder': /hidden and reordered Overview cards/i,
  'sync.avoidedSystems': /avoided systems/i,
  'sync.avoidedSystemsEnabled': /whether the list is on/i,
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
      'notificationFeed',
      'settings',
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
      screen.getByRole('button', { name: 'What notifications arrive when the app is closed?' })
    ).toBeInTheDocument();
  });

  it('renders every group and every line once opened', () => {
    renderFaq();

    const items = WHAT_WE_STORE_GROUPS.flatMap((g) => g.items);
    const lines =
      QUESTIONS +
      items.length +
      items.reduce((sum, item) => sum + (item.detailKeys?.length ?? 0), 0);
    expect(screen.getAllByRole('listitem')).toHaveLength(lines);
  });

  it('answers the how-to questions with where to go', () => {
    renderFaq();
    expect(
      screen.getByText(/Delete all data deletes every character's synced data/)
    ).toBeInTheDocument();
    expect(screen.getByText(/press Update now/)).toBeInTheDocument();
    expect(screen.getByText(/Only alerts whose time is known ahead/)).toBeInTheDocument();
  });

  it('has no group listing things we do not hold', () => {
    // Dropped on purpose: a list of what is *not* stored is unfalsifiable by
    // the reader and unbounded by nature. The two groups account for what
    // exists; absence from both is the answer.
    expect(WHAT_WE_STORE_GROUPS).toHaveLength(2);
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
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument();
  });

  it('points to the Help page’s Support tab', () => {
    renderFaq();
    const link = screen.getByRole('link', { name: /support/i });
    expect(link).toHaveAttribute('href', '/help/support');
  });
});
