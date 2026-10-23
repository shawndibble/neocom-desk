/**
 * The Sovereignty widget on the Corp Board: added from the Gallery, one row
 * per skyhook with its unsecured ISK, no horizontal scroll at any width, and a
 * row that opens its facts in a modal with the jump count linking to Route
 * Safety.
 */
import { test, expect } from './support/testBase';
import { CORPORATION_ID } from './support/fixtureData';
import { openCorpOverview, overflow } from './support/corpBoard';

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const GAS = 81143;
const ICE = 81144;
const corp = `/corporations/${CORPORATION_ID}/structures`;

const SKYHOOKS: Record<number, { planet: number; name: string; system: number; opensIn: number }> =
  {
    1: { planet: 40100001, name: 'X-7OMU IV', system: 30001978, opensIn: 2 * HOUR },
    2: { planet: 40100002, name: 'Efa II', system: 30003892, opensIn: 5 * HOUR },
    3: { planet: 40100003, name: '4-HWWF VII', system: 30000240, opensIn: 27 * HOUR },
  };

function sovereignty(path: string): unknown {
  if (path === `${corp}/skyhooks`) {
    return {
      skyhooks: Object.entries(SKYHOOKS).map(([id, s]) => ({
        id: Number(id),
        planet_id: s.planet,
      })),
    };
  }
  const detail = /\/skyhooks\/(\d+)$/.exec(path);
  if (detail) {
    const id = Number(detail[1]);
    const skyhook = SKYHOOKS[id]!;
    return {
      id,
      planet_id: skyhook.planet,
      is_active: true,
      effective_workforce: 0,
      state: 'ShieldVulnerable',
      reagents: [
        {
          type_id: id === 2 ? ICE : GAS,
          secured_stock: 11_800,
          unsecured_stock: id * 2_100,
          last_cycle: iso(-HOUR),
        },
      ],
      theft_vulnerability: { start: iso(skyhook.opensIn), end: iso(skyhook.opensIn + 4 * HOUR) },
    };
  }
  if (path === `${corp}/sovereignty-hubs`) {
    return { sovereignty_hubs: [{ id: 9, solar_system_id: 30003892 }] };
  }
  if (path === `${corp}/sovereignty-hubs/9`) {
    return {
      id: 9,
      solar_system_id: 30003892,
      fuel_access_list_id: 1,
      reagent_bay: {
        last_updated: iso(-HOUR),
        reagents: [{ type_id: ICE, amount: 3_240, burning_per_hour: 120 }],
      },
      resources: {
        power: { allocated: 1, available: 2 },
        workforce: { allocated: 1, available: 2 },
      },
      upgrades: [],
      vulnerability_window: { start: iso(30 * HOUR), end: iso(34 * HOUR) },
    };
  }
  const planet = /^\/universe\/planets\/(\d+)$/.exec(path);
  if (planet) {
    const skyhook = Object.values(SKYHOOKS).find((s) => s.planet === Number(planet[1]));
    if (skyhook) {
      return {
        planet_id: skyhook.planet,
        name: skyhook.name,
        system_id: skyhook.system,
        type_id: 11,
        position: { x: 0, y: 0, z: 0 },
      };
    }
  }
  if (path === '/markets/prices') {
    return [
      { type_id: GAS, average_price: 98_000, adjusted_price: 98_000 },
      { type_id: ICE, average_price: 24_500, adjusted_price: 24_500 },
    ];
  }
  return undefined;
}

test.describe('Sovereignty widget', () => {
  test('lists each skyhook, fits every width, and opens a row in a modal', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Reagents are newer than the slim SDE snapshot, so their names come from ESI.
    await page.route('https://esi.evetech.net/universe/names**', async (route) => {
      const ids = (route.request().postDataJSON() ?? []) as number[];
      const names = { [GAS]: 'Magmatic Gas', [ICE]: 'Superionic Ice' } as Record<number, string>;
      if (!ids.every((id) => id in names)) return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ids.map((id) => ({ id, name: names[id], category: 'inventory_type' }))
        ),
      });
    });
    await openCorpOverview(page, sovereignty);

    await page.locator('#route-outlet').getByRole('button', { name: 'Customize' }).click();
    await page.getByRole('button', { name: 'Add widget' }).click();
    const gallery = page.getByRole('dialog', { name: 'Add a widget' });
    await gallery.getByRole('button', { name: 'Add Sovereignty' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Done' }).click();

    const widget = page.getByRole('region', { name: 'Sovereignty', exact: true });
    await widget.scrollIntoViewIfNeeded();
    await expect(widget.getByRole('button', { name: 'X-7OMU IV' })).toBeVisible();
    await expect(widget).toContainText('2skyhooks raidable in 6h');
    await expect(widget).toContainText('205,800,000 ISK');
    await expect(widget.getByRole('button', { name: 'Efa II' })).toBeVisible();

    for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const { scrollWidth, clientWidth, offenders } = await overflow(page);
      expect(
        scrollWidth,
        `${width}px: page is ${scrollWidth}px wide in ${clientWidth}px. Widest: ${offenders.join(', ')}`
      ).toBeLessThanOrEqual(clientWidth);
      await widget.screenshot({ path: testInfo.outputPath(`widget-${width}.png`) });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await widget.getByRole('button', { name: 'X-7OMU IV' }).click();
    const modal = page.getByRole('dialog', { name: 'X-7OMU IV' });
    await expect(modal).toContainText('opens in');
    await expect(modal).toContainText('Shield vulnerable');
    await expect(modal).toContainText('Magmatic Gas');
    await expect(modal.getByRole('link', { name: /route safety to X-7OMU/i })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('modal-1440.png') });

    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await widget.getByRole('button', { name: 'Efa II' }).click();
    await expect(page.getByRole('dialog', { name: 'Efa II' })).toContainText('Superionic Ice');
    await page.screenshot({ path: testInfo.outputPath('modal-390.png') });
  });
});
