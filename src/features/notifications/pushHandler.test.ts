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

describe('parsePushPayload', () => {
  it('parses a well-formed payload', () => {
    expect(parsePushPayload(JSON.stringify(VALID_PAYLOAD))).toEqual(VALID_PAYLOAD);
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

  it('returns null when characterId is missing or the wrong type', () => {
    expect(parsePushPayload(JSON.stringify({ ...VALID_PAYLOAD, characterId: '12345' }))).toBeNull();
    const { eventId, occurrenceKey, title, body } = VALID_PAYLOAD;
    expect(parsePushPayload(JSON.stringify({ eventId, occurrenceKey, title, body }))).toBeNull();
  });

  it('returns null for an eventId outside the Notification Event catalog', () => {
    expect(
      parsePushPayload(JSON.stringify({ ...VALID_PAYLOAD, eventId: 'notARealEvent' }))
    ).toBeNull();
  });

  it('returns null for a missing or empty occurrenceKey', () => {
    expect(parsePushPayload(JSON.stringify({ ...VALID_PAYLOAD, occurrenceKey: '' }))).toBeNull();
    expect(parsePushPayload(JSON.stringify({ ...VALID_PAYLOAD, occurrenceKey: 42 }))).toBeNull();
  });

  it('returns null for a missing or empty title', () => {
    expect(parsePushPayload(JSON.stringify({ ...VALID_PAYLOAD, title: '' }))).toBeNull();
    expect(parsePushPayload(JSON.stringify({ ...VALID_PAYLOAD, title: undefined }))).toBeNull();
  });

  it('returns null when body is not a string', () => {
    expect(parsePushPayload(JSON.stringify({ ...VALID_PAYLOAD, body: 42 }))).toBeNull();
  });
});

describe('handlePush', () => {
  it('shows a notification carrying the payload title and body', async () => {
    const e = env();
    await handlePush(e, JSON.stringify(VALID_PAYLOAD), Date.now());

    expect(e.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = vi.mocked(e.showNotification).mock.calls[0];
    expect(title).toBe(VALID_PAYLOAD.title);
    expect(options.body).toBe(VALID_PAYLOAD.body);
  });

  it('tags and routes the notification the same way a poller-raised one would', async () => {
    const e = env();
    await handlePush(e, JSON.stringify(VALID_PAYLOAD), Date.now());

    const [, options] = vi.mocked(e.showNotification).mock.calls[0];
    expect(options.tag).toBe(
      notificationTagFor({ characterId: VALID_PAYLOAD.characterId, eventId: VALID_PAYLOAD.eventId })
    );
    expect(options.data).toEqual({ url: '/industry' });
  });

  it('records a feed entry keyed by the Occurrence Key', async () => {
    const e = env();
    const now = 1_700_000_000_000;
    await handlePush(e, JSON.stringify(VALID_PAYLOAD), now);

    expect(e.recordFeedEntry).toHaveBeenCalledWith({
      id: VALID_PAYLOAD.occurrenceKey,
      characterId: VALID_PAYLOAD.characterId,
      eventId: VALID_PAYLOAD.eventId,
      title: VALID_PAYLOAD.title,
      body: VALID_PAYLOAD.body,
      firedAt: now,
    });
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
    await expect(handlePush(e, JSON.stringify(VALID_PAYLOAD), Date.now())).resolves.toBeUndefined();
  });

  it('resolves and still shows a notification when recordFeedEntry throws', async () => {
    const e = env({
      recordFeedEntry: vi.fn(async () => {
        throw new Error('db closed');
      }),
    });
    await expect(handlePush(e, JSON.stringify(VALID_PAYLOAD), Date.now())).resolves.toBeUndefined();
    expect(e.showNotification).toHaveBeenCalledTimes(1);
  });
});
