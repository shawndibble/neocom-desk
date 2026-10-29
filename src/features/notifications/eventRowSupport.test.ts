import { describe, expect, it } from 'vitest';
import { pushBadgeKind } from './eventRowSupport';

describe('pushBadgeKind', () => {
  it('marks a Scheduled Push event, a server-pushed one, and neither', () => {
    expect(pushBadgeKind('industryJobComplete')).toBe('scheduled');
    expect(pushBadgeKind('communityJoinRequest')).toBe('server');
    expect(pushBadgeKind('priceAlertTriggered')).toBe('server');
    // Only one sub-case projects, so no promise about every occurrence.
    expect(pushBadgeKind('eveNotification')).toBeNull();
    // A loss is raised by the open app only (decision 20261029-000802).
    expect(pushBadgeKind('shipLost')).toBeNull();
    // Mail reaches a closed app only under a mail-capable Alerts Grant (ADR 0029).
    expect(pushBadgeKind('newMail')).toBe('mail');
  });
});
