/**
 * Corp Members on a phone: the roster is a table read across columns (last
 * seen, ship, location, joined), so it stays a plain table below `sm`
 * (`responsive="table"`) with the member column pinned, and its sort buttons
 * stay in the header row. No stacked cards, no "Sort by" picker.
 *
 * `/corp/members` is Director-only (`canReadMembers` in
 * `engine/corpRoles.ts`), so the shared mock's default `{}` roles response
 * (which parks every other spec's fixture pilot at `useCorpAccess === 'none'`)
 * is overridden here to `['Director']`, and the JWT carries the `corp` scope
 * group on top of the base fixture grant.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';
import { scopesForGroup } from '../src/esi/scopes';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const MEMBER_IDS = [90000201, 90000202, 90000203];

/** `membertracking`: distinct ships, so sorting by Ship is a visible reorder. */
const TRACKING = [
  {
    character_id: 90000201,
    logon_date: '2026-09-01T00:00:00Z',
    logoff_date: '2026-09-02T00:00:00Z',
    start_date: '2025-01-01T00:00:00Z',
    ship_type_id: null,
    location_id: null,
  },
  {
    character_id: 90000202,
    logon_date: '2026-09-20T00:00:00Z',
    logoff_date: '2026-09-21T00:00:00Z',
    start_date: '2025-06-01T00:00:00Z',
    ship_type_id: null,
    location_id: null,
  },
  {
    character_id: 90000203,
    logon_date: '2026-09-27T00:00:00Z',
    logoff_date: '2026-09-27T12:00:00Z',
    start_date: '2025-09-01T00:00:00Z',
    ship_type_id: null,
    location_id: null,
  },
];

test.describe('Corp Members narrow table', () => {
  test.beforeEach(async ({ page }) => {
    // Granting the whole `corp` scope group (needed for the Director-only
    // `/corp/members` read) also opens every other corp capability, and
    // `app/prefetch.ts` warms all of them at boot — not just the three this
    // spec cares about. Anything else under `/corporations/{id}/` answers
    // empty here, the same "spec that needs real rows overrides it" contract
    // `mockEsi.ts`'s own `PREFETCHED_EMPTY` documents for character routes.
    await page.route('https://esi.evetech.net/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

      if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Director'] });
      if (path === `/corporations/${CORPORATION_ID}/members`) return json(MEMBER_IDS);
      if (path === `/corporations/${CORPORATION_ID}/membertracking`) return json(TRACKING);
      if (path === `/corporations/${CORPORATION_ID}/roles`) return json([]);
      if (path.startsWith(`/corporations/${CORPORATION_ID}/`)) return json([]);

      await route.fallback();
    });

    await signInAndGoto(page, './corp/members', [...SCOPES, ...scopesForGroup('corp')]);
  });

  test('roster stays a plain sortable table at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/members');

    const header = page.getByRole('columnheader', { name: /Ship/ });
    await expect(header).toBeVisible();
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
    // Still a table, not cards.
    const rowDisplay = await page
      .locator('table tbody tr:not(.dt-spacer)')
      .first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(rowDisplay).toBe('table-row');
    await expectNoPageOverflow(page);
    await header.getByRole('button').click();
    expect(new URL(page.url()).search).toContain('sort');
  });

  test('no picker at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./corp/members');
    await expect(page.getByRole('columnheader', { name: /Ship/ })).toBeVisible();
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
  });
});
