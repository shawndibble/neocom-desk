import { describe, expect, it } from 'vitest';
import { pushBadgeKind } from './eventRowSupport';

describe('pushBadgeKind', () => {
  it('marks a Scheduled Push event, a server-pushed one, and neither', () => {
    expect(pushBadgeKind('industryJobComplete')).toBe('scheduled');
    expect(pushBadgeKind('communityJoinRequest')).toBe('server');
    expect(pushBadgeKind('priceAlertTriggered')).toBe('server');
    expect(pushBadgeKind('eveNotification')).toBeNull();
    expect(pushBadgeKind('shipLost')).toBeNull();
    expect(pushBadgeKind('newMail')).toBe('mail');
  });
});
