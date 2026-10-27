import { describe, it, expect } from 'vitest';
import { lpCorpStationSystems } from './lpCorpStationSystems.mjs';

describe('lpCorpStationSystems', () => {
  const corps = [{ id: 1000120 }, { id: 1000130 }, { id: 1000999 }];

  it('groups distinct station systems per LP corporation, sorted', () => {
    const stations = [
      { systemId: 30000003, ownerCorporationId: 1000120 },
      { systemId: 30000001, ownerCorporationId: 1000120 },
      { systemId: 30000003, ownerCorporationId: 1000120 },
      { systemId: 30000009, ownerCorporationId: 1000130 },
    ];
    expect(lpCorpStationSystems(corps, stations)).toEqual({
      1000120: [30000001, 30000003],
      1000130: [30000009],
    });
  });

  it('drops a corporation with no station and ignores stations of non-LP corps', () => {
    const stations = [
      { systemId: 30000001, ownerCorporationId: 5 },
      { systemId: 30000002 },
      { systemId: 30000004, ownerCorporationId: 1000130 },
    ];
    const result = lpCorpStationSystems(corps, stations);
    expect(result).toEqual({ 1000130: [30000004] });
    expect(1000999 in result).toBe(false);
  });
});
