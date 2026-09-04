import { describe, it, expect } from 'vitest';
import { groupIdenticalFires } from './groupFires';

interface TestFire {
  eventId: string;
  orderId?: number;
}

function rendered(fire: TestFire, title: string, body: string) {
  return { fire, title, body };
}

describe('groupIdenticalFires', () => {
  it('returns one group of count 1 for a single fire', () => {
    const groups = groupIdenticalFires([
      rendered(
        { eventId: 'marketOrderFilled', orderId: 1 },
        'Market order filled',
        'Your order was filled.'
      ),
    ]);
    expect(groups).toEqual([
      {
        fire: { eventId: 'marketOrderFilled', orderId: 1 },
        title: 'Market order filled',
        body: 'Your order was filled.',
        count: 1,
      },
    ]);
  });

  it('collapses fires with identical eventId, title and body into one group with the right count', () => {
    const groups = groupIdenticalFires([
      rendered(
        { eventId: 'marketOrderFilled', orderId: 1 },
        'Market order filled',
        'Your order was filled.'
      ),
      rendered(
        { eventId: 'marketOrderFilled', orderId: 2 },
        'Market order filled',
        'Your order was filled.'
      ),
      rendered(
        { eventId: 'marketOrderFilled', orderId: 3 },
        'Market order filled',
        'Your order was filled.'
      ),
    ]);
    expect(groups).toEqual([
      {
        fire: { eventId: 'marketOrderFilled', orderId: 1 },
        title: 'Market order filled',
        body: 'Your order was filled.',
        count: 3,
      },
    ]);
  });

  it('keeps the first fire of the group as the representative, not the last', () => {
    const groups = groupIdenticalFires([
      rendered(
        { eventId: 'marketOrderFilled', orderId: 1 },
        'Market order filled',
        'Your order was filled.'
      ),
      rendered(
        { eventId: 'marketOrderFilled', orderId: 2 },
        'Market order filled',
        'Your order was filled.'
      ),
    ]);
    expect(groups[0].fire).toEqual({ eventId: 'marketOrderFilled', orderId: 1 });
  });

  it('keeps fires with a different body separate, even with the same eventId and title', () => {
    const groups = groupIdenticalFires([
      rendered({ eventId: 'skillLevelComplete' }, 'Skill training complete', 'Finished Gunnery V.'),
      rendered(
        { eventId: 'skillLevelComplete' },
        'Skill training complete',
        'Finished Missiles IV.'
      ),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].count).toBe(1);
    expect(groups[1].count).toBe(1);
  });

  it('keeps fires with the same title/body but different eventIds separate', () => {
    const groups = groupIdenticalFires([
      rendered({ eventId: 'newMail' }, 'Same copy', 'Same body.'),
      rendered({ eventId: 'newCalendarEvent' }, 'Same copy', 'Same body.'),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("preserves group order by each group's first occurrence, interleaved fires included", () => {
    const groups = groupIdenticalFires([
      rendered({ eventId: 'marketOrderFilled', orderId: 1 }, 'Market order filled', 'Filled.'),
      rendered({ eventId: 'newMail' }, 'New mail', 'You have new mail.'),
      rendered({ eventId: 'marketOrderFilled', orderId: 2 }, 'Market order filled', 'Filled.'),
    ]);
    expect(groups.map((g) => g.fire.eventId)).toEqual(['marketOrderFilled', 'newMail']);
    expect(groups[0].count).toBe(2);
    expect(groups[1].count).toBe(1);
  });

  it('returns an empty array for no fires', () => {
    expect(groupIdenticalFires([])).toEqual([]);
  });
});
