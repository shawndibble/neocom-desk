import { describe, expect, it } from 'vitest';
import { alertTopic } from './alertTopic';

describe('alertTopic', () => {
  it.each([
    ['event:marketOrderUndercut', 'market'],
    ['event:industryJobComplete', 'industry'],
    ['event:newMail', 'mail'],
    ['event:skillLevelComplete', 'skills'],
    ['event:structureFuelLow', 'structures'],
    ['eveType:StructureUnderAttack', 'structures'],
    ['eveType:MoonminingExtractionFinished', 'structures'],
  ])('files %s under %s, the chip the bar already uses', (key, topic) => {
    expect(alertTopic(key)).toBe(topic);
  });

  it('falls back to "other" for a group that has no chip, so no row is left without a topic', () => {
    // An EVE notification outside the structure prefixes, and an event missing from the chip table.
    expect(alertTopic('eveType:CorpAllBillMsg')).toBe('other');
    expect(alertTopic('event:shipLost')).toBe('other');
    expect(alertTopic('event:notARealEvent')).toBe('other');
  });
});
