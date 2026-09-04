import { describe, it, expect } from 'vitest';
import { SHARED_NOTIFICATION_WORDING, renderWording } from './notificationWording';

describe('renderWording', () => {
  it('fills {{placeholder}} tokens from the given vars', () => {
    expect(
      renderWording('{{character}} says {{word}}.', { character: 'Kestrel', word: 'hi' })
    ).toEqual('Kestrel says hi.');
  });

  it('accepts numbers, stringifying them', () => {
    expect(renderWording('{{hours}} hours left', { hours: 6 })).toEqual('6 hours left');
  });

  it('leaves an unmatched token untouched rather than dropping it silently', () => {
    expect(renderWording('{{character}} did {{unknown}}', { character: 'Kestrel' })).toEqual(
      'Kestrel did {{unknown}}'
    );
  });

  it('substitutes every occurrence of a repeated token', () => {
    expect(renderWording('{{x}} and {{x}}', { x: 'A' })).toEqual('A and A');
  });
});

describe('SHARED_NOTIFICATION_WORDING', () => {
  it('carries exactly the six events shared between the live path and Scheduled Push', () => {
    expect(Object.keys(SHARED_NOTIFICATION_WORDING).sort()).toEqual(
      [
        'calendarEventStarting',
        'characterNotTraining',
        'industryJobComplete',
        'planetaryExtractionDone',
        'planetaryExtractorExpiring',
        'skillLevelComplete',
      ].sort()
    );
  });

  it('every template has a non-empty title and body', () => {
    for (const template of Object.values(SHARED_NOTIFICATION_WORDING)) {
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.body.length).toBeGreaterThan(0);
    }
  });
});
