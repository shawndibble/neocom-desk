import { describe, it, expect, vi } from 'vitest';
import { handlePush, parsePushPayload, type PushEnv, type PushPayload } from './pushHandler';
import { notificationTagFor } from './notificationOptions';

function env(overrides: Partial<PushEnv> = {}): PushEnv {
  return {
    showNotification: vi.fn(async () => {}),
    recordFeedEntry: vi.fn(async () => {}),
    ...overrides,
  };
}

const VALID_PAYLOAD: PushPayload = {
  characterId: 12345,
  eventId: 'industryJobComplete',
  occurrenceKey: '12345:industryJobComplete:987',
  title: 'Industry job complete',
  body: "Aurelia's industry job for Tritanium is complete.",
};

/**
 * The real FCM webpush wire shape: custom fields nested under `data`, every
 * value a string (Admin SDK's `data` is `{[key: string]: string}`) — see
 * `parsePushPayload`'s docstring for how this was confirmed against
 * `@firebase/messaging`'s own service-worker source.
 */
function rawFcmPayload(payload: Partial<Record<keyof PushPayload, unknown>>): string {
  return JSON.stringify({ data: payload });
}

describe('parsePushPayload', () => {
  it('parses a well-formed payload nested under data, coercing characterId from a string', () => {
    expect(
      parsePushPayload(
        rawFcmPayload({ ...VALID_PAYLOAD, characterId: String(VALID_PAYLOAD.characterId) })
      )
    ).toEqual(VALID_PAYLOAD);
  });

  it('returns null for no data at all', () => {
    expect(parsePushPayload(null)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parsePushPayload('{not json')).toBeNull();
  });

  it('returns null for a JSON value that is not an object', () => {
    expect(parsePushPayload('42')).toBeNull();
    expect(parsePushPayload('null')).toBeNull();
    expect(parsePushPayload('"hello"')).toBeNull();
  });

  it('returns null when there is no data envelope at all', () => {
    expect(parsePushPayload(JSON.stringify({ ...VALID_PAYLOAD }))).toBeNull();
    expect(parsePushPayload(JSON.stringify({ notification: { title: 'x' } }))).toBeNull();
  });

  it('returns null when characterId is missing, non-numeric, or already a number', () => {
    // Already a number is invalid too: real FCM data values are always
    // strings, so a numeric characterId here can never come off the wire.
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId: VALID_PAYLOAD.characterId }))
    ).toBeNull();
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId: 'not-a-number' }))
    ).toBeNull();
    const { eventId, occurrenceKey, title, body } = VALID_PAYLOAD;
    expect(parsePushPayload(rawFcmPayload({ eventId, occurrenceKey, title, body }))).toBeNull();
  });

  it('returns null for an eventId outside the Notification Event catalog', () => {
    const characterId = String(VALID_PAYLOAD.characterId);
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId, eventId: 'notARealEvent' }))
    ).toBeNull();
  });

  it('returns null for a missing or empty occurrenceKey', () => {
    const characterId = String(VALID_PAYLOAD.characterId);
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId, occurrenceKey: '' }))
    ).toBeNull();
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId, occurrenceKey: 42 }))
    ).toBeNull();
  });

  it('returns null for a missing or empty title', () => {
    const characterId = String(VALID_PAYLOAD.characterId);
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId, title: '' }))
    ).toBeNull();
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId, title: undefined }))
    ).toBeNull();
  });

  it('returns null when body is not a string', () => {
    const characterId = String(VALID_PAYLOAD.characterId);
    expect(parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId, body: 42 }))).toBeNull();
  });

  it('carries an optional eveType through, for per-type muting of a push-delivered eveNotification', () => {
    const characterId = String(VALID_PAYLOAD.characterId);
    expect(
      parsePushPayload(
        rawFcmPayload({ ...VALID_PAYLOAD, characterId, eveType: 'StructureLostShields' })
      )
    ).toEqual({ ...VALID_PAYLOAD, eveType: 'StructureLostShields' });
  });

  it('omits eveType when the wire payload has none', () => {
    const characterId = String(VALID_PAYLOAD.characterId);
    const parsed = parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId }));
    expect(parsed?.eveType).toBeUndefined();
  });

  it('returns null when eveType is present but not a string', () => {
    const characterId = String(VALID_PAYLOAD.characterId);
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId, eveType: 42 }))
    ).toBeNull();
  });
});

const VALID_RAW = rawFcmPayload({
  ...VALID_PAYLOAD,
  characterId: String(VALID_PAYLOAD.characterId),
});

describe('handlePush', () => {
  it('shows a notification carrying the payload title and body', async () => {
    const e = env();
    await handlePush(e, VALID_RAW, Date.now());

    expect(e.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = vi.mocked(e.showNotification).mock.calls[0];
    expect(title).toBe(VALID_PAYLOAD.title);
    expect(options.body).toBe(VALID_PAYLOAD.body);
  });

  it('tags and routes the notification the same way a poller-raised one would', async () => {
    const e = env();
    await handlePush(e, VALID_RAW, Date.now());

    const [, options] = vi.mocked(e.showNotification).mock.calls[0];
    expect(options.tag).toBe(
      notificationTagFor({ characterId: VALID_PAYLOAD.characterId, eventId: VALID_PAYLOAD.eventId })
    );
    expect(options.data).toEqual({ url: '/industry' });
  });

  it('records a feed entry keyed by the Occurrence Key', async () => {
    const e = env();
    const now = 1_700_000_000_000;
    await handlePush(e, VALID_RAW, now);

    expect(e.recordFeedEntry).toHaveBeenCalledWith({
      id: VALID_PAYLOAD.occurrenceKey,
      characterId: VALID_PAYLOAD.characterId,
      eventId: VALID_PAYLOAD.eventId,
      title: VALID_PAYLOAD.title,
      body: VALID_PAYLOAD.body,
      firedAt: now,
    });
  });

  it("records the feed entry's eveType when the pushed payload carries one", async () => {
    const e = env();
    const now = 1_700_000_000_000;
    const raw = rawFcmPayload({
      ...VALID_PAYLOAD,
      characterId: String(VALID_PAYLOAD.characterId),
      eveType: 'StructureLostShields',
    });
    await handlePush(e, raw, now);

    expect(e.recordFeedEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eveType: 'StructureLostShields' })
    );
  });

  it('still shows a notification when the payload is missing', async () => {
    const e = env();
    await handlePush(e, null, Date.now());

    expect(e.showNotification).toHaveBeenCalledTimes(1);
    expect(e.recordFeedEntry).not.toHaveBeenCalled();
  });

  it('tags the fallback notification so repeated malformed pushes replace rather than stack', async () => {
    const e = env();
    await handlePush(e, null, Date.now());
    await handlePush(e, '{not json', Date.now());

    const [, firstOptions] = vi.mocked(e.showNotification).mock.calls[0];
    const [, secondOptions] = vi.mocked(e.showNotification).mock.calls[1];
    expect(firstOptions.tag).toBeTruthy();
    expect(firstOptions.renotify).toBe(true);
    expect(secondOptions.tag).toBe(firstOptions.tag);
  });

  it('still shows a notification when the payload is malformed', async () => {
    const e = env();
    await handlePush(e, '{not json', Date.now());

    expect(e.showNotification).toHaveBeenCalledTimes(1);
    expect(e.recordFeedEntry).not.toHaveBeenCalled();
  });

  it('still shows a notification when the payload is missing required fields', async () => {
    const e = env();
    await handlePush(e, JSON.stringify({ title: 'no eventId or key' }), Date.now());

    expect(e.showNotification).toHaveBeenCalledTimes(1);
    expect(e.recordFeedEntry).not.toHaveBeenCalled();
  });

  it('resolves rather than rejecting when showNotification throws', async () => {
    const e = env({
      showNotification: vi.fn(async () => {
        throw new Error('permission revoked');
      }),
    });
    await expect(handlePush(e, VALID_RAW, Date.now())).resolves.toBeUndefined();
  });

  it('resolves and still shows a notification when recordFeedEntry throws', async () => {
    const e = env({
      recordFeedEntry: vi.fn(async () => {
        throw new Error('db closed');
      }),
    });
    await expect(handlePush(e, VALID_RAW, Date.now())).resolves.toBeUndefined();
    expect(e.showNotification).toHaveBeenCalledTimes(1);
  });
});
