/**
 * Contacts on a phone (issue #1978): both tables are sortable, but below `sm`
 * `DataTable` stacks into cards and hides the header row with every sort
 * button. `mobileSort` adds the phone-only "Sort by" picker above the cards.
 *
 * Contacts are seeded by overriding the `contacts` route the shared ESI mock
 * answers empty (registered after `signInAndGoto`, so it wins). The Across
 * tab needs a second Character: only its Dexie rows are seeded, with a fresh
 * cached contact list the loader serves without a live token.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const ALT_ID = 90000002;

const CONTACTS = [
  { contact_id: 90000101, contact_type: 'character', standing: -10 },
  { contact_id: 90000102, contact_type: 'character', standing: 10 },
];

async function seedContacts(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/characters/${CHARACTER_ID}/contacts/labels`,
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route(
    (url) => url.pathname === `/characters/${CHARACTER_ID}/contacts`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CONTACTS),
      })
  );
}

async function seedAlt(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, contacts }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['characters', 'esiCache'], 'readwrite');
        tx.objectStore('characters').put({
          characterId,
          name: 'Alt Pilot',
          ownerHash: 'OWNERHASH-ALT',
          addedAt: now,
        });
        tx.objectStore('esiCache').put({
          characterId,
          key: 'contacts',
          value: contacts,
          fetchedAt: now,
          truncated: false,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { characterId: ALT_ID, contacts: [CONTACTS[1]] }
  );
}

test.describe('Contacts sort picker', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndGoto(page);
    await seedContacts(page);
  });

  test('character table has a phone sort picker at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./contacts');

    const sortBy = page.getByLabel('Sort by', { exact: true });
    await expect(sortBy).toBeAttached();
    await sortBy.selectOption({ label: 'Standing ↑' });
    await expect(sortBy.locator('option:checked')).toHaveText('Standing ↑');
    expect(new URL(page.url()).search).toContain('sort');
  });

  test('across tab has a phone sort picker at 390px', async ({ page }) => {
    await seedAlt(page);
    await page.setViewportSize(PHONE);
    await page.goto('./contacts/across');

    // The Across table itself, not the single-Character fallback.
    await expect(
      page.getByRole('table', { name: 'Contacts across every character' })
    ).toBeVisible();
    const sortBy = page.getByLabel('Sort by', { exact: true });
    await expect(sortBy).toBeAttached();
    await expect(sortBy.locator('option', { hasText: 'On' }).first()).toBeAttached();
  });

  test('no picker at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./contacts');
    await expect(page.getByRole('columnheader', { name: /Standing/ })).toBeVisible();
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
  });
});
