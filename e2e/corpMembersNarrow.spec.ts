/**
 * Corp Members on a phone (issue #2190): the roster's `DataTable` is fully
 * sortable, but below `sm` the stacked cards hide the header row and every
 * sort button with it. `mobileSort` adds the phone-only "Sort by" picker
 * above the cards, the same fix already shipped on five other tables (see
 * `e2e/contactsNarrow.spec.ts`, the closest sibling this spec follows).
 *
 * `/corp/members` is Director-only (`canReadMembers` in
 * `engine/corpRoles.ts`), so the shared mock's default `{}` roles response
 * (which parks every other spec's fixture pilot at `useCorpAccess === 'none'`)
 * is overridden here to `['Director']`, and the JWT carries the `corp` scope
 * group on top of the base fixture grant — the same shape
 * `e2e/corpBoardNarrow.spec.ts` needed, but built through `signInAndGoto`'s
 * own `scopes` param instead of a second SSO token route.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
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

test.describe('Corp Members sort picker', () => {
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

  test('roster has a phone sort picker at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/members');

    const sortBy = page.getByLabel('Sort by', { exact: true });
    await expect(sortBy).toBeAttached();
    await sortBy.selectOption({ label: 'Ship ↑' });
    await expect(sortBy.locator('option:checked')).toHaveText('Ship ↑');
    expect(new URL(page.url()).search).toContain('sort');
  });

  test('no picker at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./corp/members');
    await expect(page.getByRole('columnheader', { name: /Ship/ })).toBeVisible();
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
  });
});
