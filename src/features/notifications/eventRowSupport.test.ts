import { describe, expect, it } from 'vitest';
import { pushBadgeKind } from './eventRowSupport';

describe('pushBadgeKind', () => {
  it('marks a Scheduled Push event, a server-pushed one, and neither', () => {
    expect(pushBadgeKind('industryJobComplete')).toBe('scheduled');
    expect(pushBadgeKind('shipLost')).toBe('server');
    expect(pushBadgeKind('communityJoinRequest')).toBe('server');
    expect(pushBadgeKind('priceAlertTriggered')).toBe('server');
    // Only one sub-case projects, so no promise about every occurrence.
    expect(pushBadgeKind('eveNotification')).toBeNull();
    expect(pushBadgeKind('newMail')).toBeNull();
  });
});
