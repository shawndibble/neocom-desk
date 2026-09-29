import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { REMOTE_COLLECTIONS } from '@/sync/syncedCollections';
import { SYNCED_SETTING_KEYS } from '@/sync/syncedSettings';
import { FaqPanel } from './FaqPanel';
import { WHAT_WE_STORE_GROUPS, WHAT_WE_STORE_NOTES } from './whatWeStore';

function renderFaq() {
  return render(
    <MemoryRouter>
      <FaqPanel />
    </MemoryRouter>
  );
}

/**
 * Which words in the "settings" line account for each allow-listed synced key.
 * The line covers all of them at once, so it is the phrasing rather than the
 * bullet that has to keep up.
 */
const SETTING_KEY_TO_PHRASE: Readonly<Record<string, RegExp>> = {
  'sync.notificationFeedPrefs': /notification preferences/i,
  'sync.piCustomsRates': /customs rates/i,
  'sync.marketHub': /trade hub/i,
  'sync.marketPricePercent': /appraisal price percentage/i,
  'sync.industryFacilityDefaults': /industry facility/i,
  'sync.industryReactionFacilityDefaults': /reaction facility/i,
  'sync.industryAssumedMe': /assumed ME/,
  'sync.industryAssumedTe': /assumed TE/,
  'sync.industryBuildGroups': /industry build groups/i,
  'sync.piExpiringSoonHours': /expiring-soon window/i,
  'sync.corpDarkAfterDays': /dark threshold/i,
  'sync.defaultCharacterFilter': /default characters shown/i,
  'sync.spExtractionMonitoringEnabled': /SP Extraction monitoring is on/i,
  'sync.spExtractionThresholdSp': /SP threshold you set/i,
  'sync.industryIncludeBlueprintCost': /blueprint cost counts toward Industry profit/i,
  'sync.loyaltyLpValue': /ISK-per-LP value/i,
  'sync.fittingDamageProfiles': /fitting damage profiles you made/i,
  'sync.fittingDamageProfileId': /which one fittings are measured against/i,
  'sync.fittingTargetProfiles': /fitting target profiles you made/i,
  'sync.fittingTargetProfileId': /which one applied DPS is worked out against/i,
  'sync.skillCloneStates': /Alpha or Omega/i,
  'sync.miningTaxManualMoonOreTypeIds': /ore types you tagged/i,
  'sync.miningTaxManualIgnoredTypeIds': /ore types you tagged/i,
  'sync.miningTaxOreValueMode': /edits ore values individually/i,
  'sync.courierHighCollateralRatio': /courier collateral warning/i,
  'sync.bpcHideAuctions': /hide auctions/i,
  'sync.bpcHidePlex': /hide PLEX contracts/i,
  'sync.targetSkillPlan': /which skill plan you're adding skills to/i,
  'sync.overviewHiddenCards': /Overview cards you hid/i,
  'sync.overviewCardOrder': /order you put them in/i,
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

  it('renders every group and every line', () => {
    renderFaq();

    expect(screen.getByRole('heading', { name: /what we store/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /synced between your devices/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /kept on this device only/i })).toBeInTheDocument();

    const lines = WHAT_WE_STORE_GROUPS.flatMap((g) => g.items).length + WHAT_WE_STORE_NOTES.length;
    expect(screen.getAllByRole('listitem')).toHaveLength(lines);
  });

  it('has no group listing things we do not hold', () => {
    // Dropped on purpose: a list of what is *not* stored is unfalsifiable by
    // the reader and unbounded by nature. The two groups account for what
    // exists; absence from both is the answer.
    expect(WHAT_WE_STORE_GROUPS).toHaveLength(2);
    renderFaq();
    expect(screen.queryByRole('heading', { name: /never collected/i })).not.toBeInTheDocument();
  });

  it('states the three cases where something does leave the device', () => {
    // The section is worth less than nothing if it overclaims. These three are
    // the real exceptions, and each is named rather than implied.
    renderFaq();

    expect(screen.getByText(/push notifications, if you turn them on/i)).toBeInTheDocument();
    expect(screen.getByText(/crash reports/i)).toBeInTheDocument();
    expect(screen.getByText(/removing a character only clears it/i)).toBeInTheDocument();
  });

  it('says when a removed character’s synced copy actually leaves our servers', () => {
    // Removal is local-only; the remote docs go with the
    // `purgeStaleAccounts` inactivity purge. Saying "removed means deleted"
    // would be the one outright false sentence in the section.
    renderFaq();
    expect(
      screen.getByText(/no device has synced that character for 90 days/i)
    ).toBeInTheDocument();
  });

  it('does not claim EVE data is uploaded', () => {
    renderFaq();
    expect(screen.getByText(/none of it is uploaded/i)).toBeInTheDocument();
  });

  it('points to the Help & Support tab', () => {
    renderFaq();
    const link = screen.getByRole('link', { name: /help & support/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/settings'));
  });
});
