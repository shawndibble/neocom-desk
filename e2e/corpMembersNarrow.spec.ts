/**
 * Corp Members on a phone: the roster is a table read across columns (last
 * seen, ship, location, joined). Below `sm` it is a dense two-line card list
 * (`responsive="stack"`, `stackLayout="dense"`, #6561) with a "Sort by" picker
 * in place of the header row's sort buttons; from `sm` up it is the table with
 * the member column pinned.
 *
 * `/corp/members` is Director-only (`canReadMembers` in
 * `engine/corpRoles.ts`), so the shared mock's default `{}` roles response
 * (which parks every other spec's fixture pilot at `useCorpAccess === 'none'`)
 * is overridden here to `['Director']`, and the JWT carries the `corp` scope
 * group on top of the base fixture grant.
 */
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';
import { scopesForGroup } from '../src/esi/scopes';

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

  test('roster is a dense sortable card list at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./corp/members');

    // `responsive="stack"` + `stackLayout="dense"` + `mobileSort` (#6561): the
    // header row and its sort buttons are gone, the "Sort by" picker above the
    // list drives the same sort state.
    const picker = page.getByLabel('Sort by', { exact: true });
    await expect(picker).toBeAttached();
    const row = page.locator('table tbody tr:not(.dt-spacer)').first();
    await expect(row).toBeVisible();
    const rowDisplay = await row.evaluate((el) => getComputedStyle(el).display);
    expect(rowDisplay).toBe('flex');
    await expectNoPageOverflow(page);
    await picker.selectOption({ label: 'Ship ↑' });
    await expect.poll(() => new URL(page.url()).search).toContain('sort');
  });

  test('pinned Member column matches the panel surface at 1440 and 1024', async ({ page }) => {
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('./corp/members');
      // The pinned cell paints the panel surface, not the darker page behind
      // the Panel (`bg-bg`), in the header and in the body.
      const bg = (loc: ReturnType<typeof page.locator>) =>
        loc.first().evaluate((el) => getComputedStyle(el).backgroundColor);
      const pageBg = await page.evaluate(() => {
        for (const el of [document.body, document.documentElement]) {
          const c = getComputedStyle(el).backgroundColor;
          if (c !== 'rgba(0, 0, 0, 0)') return c;
        }
        return 'none';
      });
      const memberHeader = page.getByRole('columnheader', { name: /Member/ });
      await expect(memberHeader).toBeVisible();
      const row = page.locator('table tbody tr:not(.dt-spacer)').first();
      const pinnedBody = await bg(row.locator('td').first());
      expect(await bg(memberHeader)).not.toBe(pageBg);
      expect(pinnedBody).not.toBe(pageBg);
      expect(await bg(memberHeader)).toBe(pinnedBody);
    }
  });

  test('no picker at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./corp/members');
    await expect(page.getByRole('columnheader', { name: /Ship/ })).toBeVisible();
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
  });
});
