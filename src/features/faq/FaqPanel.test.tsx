import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { REMOTE_COLLECTIONS } from '@/sync/characterPurge';
import { SYNCED_SETTING_KEYS } from '@/sync/syncedSettings';
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

  it('says "two settings" only while exactly two settings sync', () => {
    // The copy names a count. `SYNCED_SETTING_KEYS` is the allow-list it counts.
    expect(SYNCED_SETTING_KEYS).toHaveLength(2);
    render(<FaqPanel />);
    expect(screen.getByText(/two settings/i)).toBeInTheDocument();
  });

  it('renders every group and every line', () => {
    render(<FaqPanel />);

    expect(screen.getByRole('heading', { name: /what we store/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /synced between your devices/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /kept on this device only/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /never collected at all/i })).toBeInTheDocument();

    const lines = WHAT_WE_STORE_GROUPS.flatMap((g) => g.items).length + WHAT_WE_STORE_NOTES.length;
    expect(screen.getAllByRole('listitem')).toHaveLength(lines);
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

  it('does not claim EVE data is uploaded, or that nothing at all is', () => {
    render(<FaqPanel />);
    expect(screen.getByText(/none of it is uploaded/i)).toBeInTheDocument();
    expect(screen.getByText(/you sign in on EVE’s own login page/i)).toBeInTheDocument();
  });
});
