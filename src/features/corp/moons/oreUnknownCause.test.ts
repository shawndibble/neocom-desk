import { describe, expect, it } from 'vitest';
import { oreUnknownCause } from './oreUnknownCause';

const feeders = [
  { corporationId: 1, readsNotifications: false },
  { corporationId: 2, readsNotifications: true },
  { corporationId: 3 },
];

describe('oreUnknownCause', () => {
  it("names the moon owner's grant when it reads no Extraction notices", () => {
    expect(oreUnknownCause({ sourceCorporationId: 1 }, feeders)).toEqual({
      kind: 'owner-grant',
      corporationId: 1,
    });
  });

  it('knows no cause when the grant reads them, has not said, or the chunk is the book’s own', () => {
    expect(oreUnknownCause({ sourceCorporationId: 2 }, feeders)).toBeNull();
    expect(oreUnknownCause({ sourceCorporationId: 3 }, feeders)).toBeNull();
    expect(oreUnknownCause({ sourceCorporationId: 4 }, feeders)).toBeNull();
    expect(oreUnknownCause({}, feeders)).toBeNull();
    expect(oreUnknownCause({ sourceCorporationId: 1 }, undefined)).toBeNull();
  });
});
