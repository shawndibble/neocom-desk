import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { LocationCell } from './marketOrderCells';
import type { RegionOrder } from '@/esi/endpoints';

const STATION_ORDER: RegionOrder = {
  order_id: 1,
  type_id: 34,
  location_id: 60003760,
  system_id: 30000142,
  is_buy_order: true,
  price: 5,
  volume_remain: 100,
  volume_total: 100,
  min_volume: 1,
  duration: 90,
  issued: '2026-01-01T00:00:00Z',
  range: 'station',
};

function renderCell(order: RegionOrder) {
  return render(
    <LocationCell
      order={order}
      npcStations={
        new Map([
          [
            60003760,
            { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 },
          ],
        ])
      }
      solarSystems={new Map([[30000142, { name: 'Jita', security: 0.9 }]])}
      t={i18n.t}
    />
  );
}

describe('LocationCell', () => {
  it('renders the full, untruncated station name as a tooltip trigger — CSS (not this markup) clips it in table mode', () => {
    renderCell(STATION_ORDER);
    const trigger = screen.getByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
    expect(trigger).toHaveAttribute('tabindex', '0');
  });

  it('renders unknown-structure orders as plain text with no tooltip trigger', () => {
    renderCell({ ...STATION_ORDER, location_id: 999999999999 });
    const text = screen.getByText(i18n.t('market.unknownStructure'));
    expect(text).not.toHaveAttribute('tabindex');
  });
});
