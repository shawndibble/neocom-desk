/** D9: Arden also holds two ore stacks (so the Assets ore dialog has something to open), and the location can be changed mid-recording. */
import type { Page } from '@playwright/test';
import { characterAssets } from '../assets';
import { ARDEN, STATIONS } from '../cast';
import { T } from '../catalog';

export const where = { systemId: 30001376 as number, stationId: STATIONS.nourvukaiken as number | null };

export async function installD9(page: Page) {
  await page.route(/esi\.evetech\.net\/.*characters\/90000001\/assets\/?(\?.*)?$/, (route) => {
    const extra = [
      { item_id: 2_099_000_001, type_id: T.veldspar, quantity: 52_000, location_id: STATIONS.tunttaras, location_type: 'station', location_flag: 'Hangar', is_singleton: false },
      { item_id: 2_099_000_002, type_id: T.scordite, quantity: 31_000, location_id: STATIONS.tunttaras, location_type: 'station', location_flag: 'Hangar', is_singleton: false },
    ];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'x-pages': '1' },
      body: JSON.stringify([...characterAssets(ARDEN.id), ...extra]),
    });
  });
  await page.route(/esi\.evetech\.net\/.*characters\/90000001\/location\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(
        where.stationId === null
          ? { solar_system_id: where.systemId }
          : { solar_system_id: where.systemId, station_id: where.stationId }
      ),
    })
  );
}
