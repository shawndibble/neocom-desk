import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { REMOTE_COLLECTIONS } from '@/sync/characterPurge';
import { SYNCED_SETTING_KEYS } from '@/sync/syncedSettings';
import { ISSUES_URL } from '@/lib/links';
import { FaqPanel } from './FaqPanel';
import { WHAT_WE_STORE_GROUPS, WHAT_WE_STORE_NOTES } from './whatWeStore';

/**
 * Which "What We Store" line accounts for each remote Firestore collection.
 *
 * Pinned deliberately, in the same spirit as `syncedSettings.ts`'s two-file
 * edit: the section is a promise to the user about what leaves their device,
 * and a new synced collection that nobody mentioned there turns that promise
 * into a false one. Adding a collection to `REMOTE_COLLECTIONS` fails this
 * test until whoever added it decides what the user should be told.
 *
 * Several collections map to one line on purpose — a reader does not want
 * "productionSaleLinks" and "productionOrderWatches" as separate bullets, they
 * want "Production Runs, and the sales and orders you linked to them".
 */
const COLLECTION_TO_ITEM: Readonly<Record<(typeof REMOTE_COLLECTIONS)[number], string>> = {
  plans: 'skillPlans',
  buildPlans: 'buildPlans',
  quickbars: 'quickbar',
  stationPins: 'stationPins',
  planetRichness: 'piPicks',
  payees: 'miningTax',
  miningTaxAssignments: 'miningTax',
  settings: 'settings',
  notificationFeed: 'notificationFeed',
  productionRuns: 'productionRuns',
  productionSaleLinks: 'productionRuns',
  productionOrderWatches: 'productionRuns',
};

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
};

function syncedItemIds(): Set<string> {
  const group = WHAT_WE_STORE_GROUPS.find((g) => g.id === 'synced');
  return new Set(group?.items.map((item) => item.id) ?? []);
}

describe('FaqPanel — What We Store', () => {
  it('accounts for every collection that actually leaves the device', () => {
    const ids = syncedItemIds();
    for (const collection of REMOTE_COLLECTIONS) {
      const itemId = COLLECTION_TO_ITEM[collection];
      expect(itemId, `no "What We Store" line covers the ${collection} collection`).toBeDefined();
      expect(ids, `${collection} maps to a line that no longer exists`).toContain(itemId);
    }
  });

  it('has no synced line that no longer corresponds to anything stored', () => {
    // The other direction: a collection removed from sync must not leave the
    // user told we still hold it. `settings` is the one line covering both
    // synced setting keys, so it is expected on both sides.
    const claimed = new Set(Object.values(COLLECTION_TO_ITEM));
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
    render(<FaqPanel />);
    const shown = document.body.textContent ?? '';
    for (const key of SYNCED_SETTING_KEYS) {
      const phrase = SETTING_KEY_TO_PHRASE[key];
      expect(phrase, `"${key}" syncs but no words in the FAQ account for it`).toBeDefined();
      expect(shown, `"${key}" syncs but the FAQ never mentions it`).toMatch(phrase);
    }
  });

  it('renders every group and every line', () => {
    render(<FaqPanel />);

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
    render(<FaqPanel />);
    expect(screen.queryByRole('heading', { name: /never collected/i })).not.toBeInTheDocument();
  });

  it('states the three cases where something does leave the device', () => {
    // The section is worth less than nothing if it overclaims. These three are
    // the real exceptions, and each is named rather than implied.
    render(<FaqPanel />);

    expect(screen.getByText(/push notifications, if you turn them on/i)).toBeInTheDocument();
    expect(screen.getByText(/crash reports/i)).toBeInTheDocument();
    expect(screen.getByText(/removing a character deletes/i)).toBeInTheDocument();
  });

  it('is honest about a deletion it cannot always carry out', () => {
    // `characterPurge.ts` records the caveat by design: a Character whose
    // refresh token is already dead cannot be signed in as, so its remote docs
    // survive until it authenticates again. Saying "removed means deleted"
    // flatly would be the one outright false sentence in the section.
    render(<FaqPanel />);
    expect(screen.getByText(/next time you add that character back/i)).toBeInTheDocument();
  });

  it('does not claim EVE data is uploaded', () => {
    render(<FaqPanel />);
    expect(screen.getByText(/none of it is uploaded/i)).toBeInTheDocument();
  });
});

describe('FaqPanel — the other questions', () => {
  it('points bug reports and feature requests at the issue tracker', () => {
    render(<FaqPanel />);

    expect(screen.getByRole('heading', { name: /report a bug or ask for a feature/i }));
    const link = screen.getByRole('link', { name: /github\.com\/shawndibble\/neocom-desk/i });
    expect(link).toHaveAttribute('href', ISSUES_URL);
    // An external link opened in this tab loses whatever the pilot was doing.
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('names the pilot to thank', () => {
    render(<FaqPanel />);

    expect(screen.getByRole('heading', { name: /someone i can thank/i })).toBeInTheDocument();
    expect(screen.getByText('Mero Otichoda')).toBeInTheDocument();
    // "Welcome" and "expected" are different claims, and the copy makes both.
    expect(screen.getByText(/never expected/i)).toBeInTheDocument();
  });
});
