import { describe, it, expect, vi, afterAll } from 'vitest';
import { handlePush, parsePushPayload, type PushEnv, type PushPayload } from './pushHandler';
import { notificationTagFor } from './notificationOptions';
import { occurrenceKey } from '@/engine/occurrenceKey';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import type { EveNotificationNames } from './eveNotificationRender';

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

const originalTz = process.env.TZ;
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

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

  it('parses the projected fireAt from its wire string, to date the feed row', () => {
    const characterId = String(VALID_PAYLOAD.characterId);
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId, fireAt: '1699999000000' }))
    ).toEqual({ ...VALID_PAYLOAD, fireAt: 1_699_999_000_000 });
  });

  it('omits fireAt when the wire payload has none or it is not a number', () => {
    const characterId = String(VALID_PAYLOAD.characterId);
    expect(parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId }))).toEqual(
      VALID_PAYLOAD
    );
    expect(
      parsePushPayload(rawFcmPayload({ ...VALID_PAYLOAD, characterId, fireAt: 'soon' }))
    ).toEqual(VALID_PAYLOAD);
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
    expect(options.data).toEqual({ url: '/industry?character=12345' });
  });

  it('records a feed entry keyed by the Occurrence Key, marked as notified on this device', async () => {
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
      notifiedHereAt: now,
    });
  });

  it('dates the feed entry by the projected fireAt, not by when the push arrived', async () => {
    const e = env();
    const now = 1_700_000_000_000;
    const fireAt = now - 15 * 3_600_000;
    const raw = rawFcmPayload({
      ...VALID_PAYLOAD,
      characterId: String(VALID_PAYLOAD.characterId),
      fireAt: String(fireAt),
    });
    await handlePush(e, raw, now);

    expect(e.recordFeedEntry).toHaveBeenCalledWith(
      expect.objectContaining({ firedAt: fireAt, notifiedHereAt: now })
    );
  });

  it('never dates the feed entry in the future when the server clock runs ahead', async () => {
    const e = env();
    const now = 1_700_000_000_000;
    const raw = rawFcmPayload({
      ...VALID_PAYLOAD,
      characterId: String(VALID_PAYLOAD.characterId),
      fireAt: String(now + 60_000),
    });
    await handlePush(e, raw, now);

    expect(e.recordFeedEntry).toHaveBeenCalledWith(expect.objectContaining({ firedAt: now }));
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

describe('server-polled EVE notifications (ADR 0020)', () => {
  const NOW = Date.parse('2026-10-14T12:00:00Z');
  const TEXT = [
    'allianceName: Big Bad Alliance',
    'structureID: 1030000000001',
    "structureName: Athanor 'Chunk Line 3'",
  ].join('\n');

  /** Exactly what `functions/src/eveNotificationPush.ts`'s `singlePush` sends. */
  function serverSingle(overrides: Record<string, string> = {}): string {
    return JSON.stringify({
      data: {
        characterId: '777',
        eventId: 'eveNotification',
        occurrenceKey: '777:eveNotification:555',
        title: 'EVE notification',
        body: 'StructureUnderAttack',
        fireAt: String(Date.parse('2026-10-14T11:50:00Z')),
        eveType: 'StructureUnderAttack',
        notificationId: '555',
        notificationTimestamp: '2026-10-14T11:50:00Z',
        notificationText: TEXT,
        ...overrides,
      },
    });
  }

  function serverSummary(): string {
    return JSON.stringify({
      data: {
        characterId: '777',
        eventId: 'eveNotification',
        occurrenceKey: '777:eveNotification:summary:560',
        title: 'New EVE notifications',
        body: '5 new EVE notifications',
        fireAt: String(Date.parse('2026-10-14T11:55:00Z')),
        summaryCount: '5',
      },
    });
  }

  const withName = (extra: Partial<PushEnv> = {}) =>
    env({ characterName: vi.fn(async () => 'Aurelia'), ...extra });

  it('renders the raw payload with the shared renderer instead of the generic copy', async () => {
    const e = withName();
    await handlePush(e, serverSingle(), NOW);

    const [title, options] = vi.mocked(e.showNotification).mock.calls[0];
    expect(title).toBe('Structure under attack');
    expect(options.body).toContain("Athanor 'Chunk Line 3'");
    expect(options.body).toContain('Big Bad Alliance');
  });

  it('writes the feed row under the key the Foreground Poller derives', async () => {
    const e = withName();
    await handlePush(e, serverSingle(), NOW);

    const pollerFire: EveNotificationFire = {
      eventId: 'eveNotification',
      characterId: 777,
      notificationId: 555,
      type: 'StructureUnderAttack',
      senderId: 1,
      senderType: 'corporation',
      text: TEXT,
      timestamp: '2026-10-14T11:50:00Z',
    };
    const [entry] = vi.mocked(e.recordFeedEntry).mock.calls[0];
    expect(entry.id).toBe(occurrenceKey(pollerFire, NOW));
    // ...and that is the string the server sends, so the two cannot drift apart.
    expect(entry.id).toBe('777:eveNotification:555');
    expect(entry.eveType).toBe('StructureUnderAttack');
    expect(entry.firedAt).toBe(Date.parse('2026-10-14T11:50:00Z'));
    expect(entry.title).toBe('Structure under attack');
  });

  it('keys on the derived key even when the payload key disagrees', async () => {
    const e = withName();
    await handlePush(e, serverSingle({ occurrenceKey: 'something-else' }), NOW);
    expect(vi.mocked(e.recordFeedEntry).mock.calls[0][0].id).toBe('777:eveNotification:555');
  });

  it('passes resolved names to the renderer', async () => {
    const e = withName({
      resolveNames: vi.fn(async () => ({ entities: new Map([[98000001, 'Marmite Corp']]) })),
    });
    await handlePush(
      e,
      serverSingle({
        eveType: 'WarDeclared',
        notificationText: 'declaredByID: 98000001\nagainstID: 98000002',
      }),
      NOW
    );
    expect(vi.mocked(e.resolveNames)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(e.showNotification).mock.calls[0][1].body).toContain('Marmite Corp');
  });

  it('a rejecting zone reader still shows the rich body, in the host zone (#4731)', async () => {
    const e = withName({ timeZone: () => Promise.reject(new Error('settings unavailable')) });
    await handlePush(
      e,
      serverSingle({
        eveType: 'OrbitalReinforced',
        notificationText: 'planetID: 40121487\nreinforceExitTime: 134259534000000000\n',
      }),
      NOW
    );
    expect(vi.mocked(e.showNotification).mock.calls[0][1].body).toMatch(
      /Timer ends \d{4}-\d{2}-\d{2}, \d{2}:\d{2}/
    );
  });

  it('renders times in the zone the Time format setting names (#4731)', async () => {
    process.env.TZ = 'Pacific/Auckland';
    const text = 'planetID: 40121487\nreinforceExitTime: 134259534000000000\n';
    const run = async (timeZone?: PushEnv['timeZone']) => {
      const e = withName(timeZone ? { timeZone } : {});
      await handlePush(
        e,
        serverSingle({ eveType: 'OrbitalReinforced', notificationText: text }),
        NOW
      );
      return vi.mocked(e.showNotification).mock.calls[0][1].body;
    };
    const eve = await run(async () => 'UTC');
    expect(eve).toContain('2026-06-14, 23:30');
    expect(await run(async () => undefined)).not.toContain('2026-06-14, 23:30');
    // No reader at all (older env): the host's own zone, as before.
    expect(await run()).toMatch(/Timer ends \d{4}-\d{2}-\d{2}, \d{2}:\d{2}/);
  });

  it('falls back to the generic body when the payload text has nothing to render', async () => {
    const e = withName();
    await handlePush(e, serverSingle({ notificationText: '' }), NOW);

    const [title, options] = vi.mocked(e.showNotification).mock.calls[0];
    expect(title).toBe('EVE notification');
    expect(options.body).toContain('Aurelia');
    expect(options.body).toContain('Structure Under Attack');
    expect(e.recordFeedEntry).toHaveBeenCalledTimes(1);
  });

  it('still renders when the Character name read fails', async () => {
    const e = env({
      characterName: vi.fn(async () => {
        throw new Error('db blocked');
      }),
    });
    await handlePush(e, serverSingle(), NOW);

    expect(e.showNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(e.showNotification).mock.calls[0][0]).toBe('Structure under attack');
  });

  it('uses a neutral phrase when the Character is unknown to this device', async () => {
    const e = env({ characterName: vi.fn(async () => undefined) });
    await handlePush(e, serverSingle({ notificationText: '' }), NOW);
    expect(vi.mocked(e.showNotification).mock.calls[0][1].body).toContain('Your character');
  });

  it('shows one summary push for a burst and writes no feed row', async () => {
    const e = withName();
    await handlePush(e, serverSummary(), NOW);

    const [title, options] = vi.mocked(e.showNotification).mock.calls[0];
    expect(title).toBe('New EVE notifications');
    expect(options.body).toBe('5 new EVE notifications for Aurelia.');
    expect(e.recordFeedEntry).not.toHaveBeenCalled();
  });

  it('words a summary without a name when the Character is unknown', async () => {
    const e = env();
    await handlePush(e, serverSummary(), NOW);
    expect(vi.mocked(e.showNotification).mock.calls[0][1].body).toBe('5 new EVE notifications.');
  });

  it('treats a push without the raw block like any other generic payload', async () => {
    const e = withName();
    await handlePush(
      e,
      serverSingle({ notificationId: 'nope', notificationTimestamp: '', notificationText: '' }),
      NOW
    );
    expect(vi.mocked(e.showNotification).mock.calls[0][0]).toBe('EVE notification');
    expect(vi.mocked(e.recordFeedEntry).mock.calls[0][0].id).toBe('777:eveNotification:555');
  });

  it('renders with ids when the name lookup hangs, instead of dropping to generic copy', async () => {
    vi.useFakeTimers();
    try {
      // Stands in for `resolvePushNames`, which gives up at the resolution budget.
      const e = withName({
        resolveNames: vi.fn(
          () => new Promise<EveNotificationNames>((resolve) => setTimeout(() => resolve({}), 3_000))
        ),
      });
      const done = handlePush(
        e,
        serverSingle({
          eveType: 'WarDeclared',
          notificationText: 'declaredByID: 98000001\nagainstID: 98000002',
        }),
        NOW
      );
      await vi.advanceTimersByTimeAsync(6_000);
      await done;
      expect(vi.mocked(e.showNotification).mock.calls[0][1].body).toContain('#98000001');
    } finally {
      vi.useRealTimers();
    }
  });

  it('still shows the generic copy when the Character name read hangs forever', async () => {
    vi.useFakeTimers();
    try {
      const e = env({ characterName: vi.fn(() => new Promise<string>(() => {})) });
      const done = handlePush(e, serverSingle({ notificationText: '' }), NOW);
      await vi.advanceTimersByTimeAsync(6_000);
      await done;
      expect(e.showNotification).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('server-pushed events (issue #5121)', () => {
  const priceFire = {
    eventId: 'priceAlertTriggered',
    characterId: 7,
    typeId: 34,
    name: 'Tritanium',
    price: 11,
    targetPrice: 10,
    direction: 'above',
  } as const;

  /** What `functions/src/serverEvents.ts`'s `buildServerEventPush` sends. */
  function serverPush(fire: { eventId: string; characterId: number }, extra = {}): string {
    return JSON.stringify({
      data: {
        characterId: String(fire.characterId),
        eventId: fire.eventId,
        occurrenceKey: 'server-key',
        title: 'Floor title',
        body: 'Floor body',
        fireAt: '1000',
        fire: JSON.stringify(fire),
        ...extra,
      },
    });
  }

  it('carries the raw fire through the parse', () => {
    expect(parsePushPayload(serverPush(priceFire))?.serverFire).toBe(JSON.stringify(priceFire));
  });

  it('renders the fire with the app’s copy and keys the row like the Foreground Poller', async () => {
    const e = env();
    await handlePush(e, serverPush(priceFire), 5000);
    const [title, options] = vi.mocked(e.showNotification).mock.calls[0];
    expect(title).toBe('Price alert');
    expect(options.body).toContain('Tritanium reached');
    expect(String(options.data?.url)).toContain('type=34');
    expect(e.recordFeedEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: occurrenceKey(priceFire, 5000),
        subjectId: 34,
        firedAt: 1000,
        notifiedHereAt: 5000,
      })
    );
  });

  it('names the ship and system of a loss through the public name lookup', async () => {
    const fire = {
      eventId: 'shipLost',
      characterId: 7,
      killmailId: 55,
      timeMs: 900,
      shipTypeId: 587,
      systemId: 30000142,
    } as const;
    const resolveIds = vi.fn(
      async () =>
        new Map([
          [587, 'Rifter'],
          [30000142, 'Jita'],
        ])
    );
    const e = env({ resolveIds });
    await handlePush(e, serverPush(fire), 5000);
    expect(resolveIds).toHaveBeenCalledWith([587, 30000142]);
    expect(vi.mocked(e.showNotification).mock.calls[0][1].body).toBe('Lost your Rifter in Jita');
    expect(e.recordFeedEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: '7:shipLost:55' })
    );
  });

  it('falls back to the sender’s copy and key for a fire that is not the push’s own', async () => {
    const e = env();
    await handlePush(e, serverPush({ ...priceFire, characterId: 8 }, { characterId: '7' }), 5000);
    expect(vi.mocked(e.showNotification).mock.calls[0][0]).toBe('Floor title');
    expect(e.recordFeedEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'server-key' }));
  });

  it('replaces this device’s earlier pop-up silently when it already notified for the occurrence', async () => {
    const alreadyNotified = vi.fn(async () => true);
    const e = env({ alreadyNotified });
    await handlePush(e, serverPush(priceFire), 5000);
    expect(alreadyNotified).toHaveBeenCalledWith(occurrenceKey(priceFire, 5000));
    expect(vi.mocked(e.showNotification).mock.calls[0][1]).toMatchObject({
      silent: true,
      renotify: false,
    });
  });
});

describe('server-pushed new mail (issue #5143)', () => {
  const fire = {
    eventId: 'newMail',
    characterId: 7,
    mailId: 120,
    sentMs: 900,
    fromId: 900,
    subject: 'Fleet tonight',
  } as const;
  /** What `functions/src/mailPush.ts`'s `buildMailPush` sends. */
  const push = (f: object = fire) =>
    JSON.stringify({
      data: {
        characterId: '7',
        eventId: 'newMail',
        occurrenceKey: '7:newMail:120',
        title: 'New mail',
        body: 'You have new mail.',
        fireAt: '900',
        fire: JSON.stringify(f),
      },
    });
  const named = {
    characterName: vi.fn(async () => 'Aurelia'),
    resolveIds: vi.fn(async () => new Map([[900, 'Vexor Fan']])),
  };

  it('words the pop-up with the sender and subject, keyed like the Foreground Poller', async () => {
    const e = env(named);
    await handlePush(e, push(), 5000);
    const [title, options] = vi.mocked(e.showNotification).mock.calls[0];
    expect(title).toBe('New mail');
    expect(options.body).toBe('Aurelia has new mail from Vexor Fan: Fleet tonight');
    expect(named.resolveIds).toHaveBeenCalledWith([900]);
  });

  it('never writes the sender or subject into the feed row, which syncs to Firestore', async () => {
    const e = env(named);
    await handlePush(e, push(), 5000);
    expect(e.recordFeedEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: occurrenceKey({ eventId: 'newMail', characterId: 7, mailId: 120 }, 5000),
        body: 'Aurelia has new mail.',
        firedAt: 900,
      })
    );
    const entry = vi.mocked(e.recordFeedEntry).mock.calls[0][0];
    expect(JSON.stringify(entry)).not.toMatch(/Fleet tonight|Vexor Fan/);
  });

  it('leaves out a sender it cannot name (a mailing list) and a missing subject', async () => {
    const e = env({ ...named, resolveIds: vi.fn(async () => new Map()) });
    await handlePush(e, push(), 5000);
    expect(vi.mocked(e.showNotification).mock.calls[0][1].body).toBe(
      'Aurelia has new mail: Fleet tonight'
    );
    const bare = env(named);
    await handlePush(bare, push({ eventId: 'newMail', characterId: 7, mailId: 120 }), 5000);
    expect(vi.mocked(bare.showNotification).mock.calls[0][1].body).toBe('Aurelia has new mail.');
  });

  it('shows the generic floor, naming nothing, for a fire that is not the push’s own', async () => {
    const e = env(named);
    await handlePush(e, push({ ...fire, characterId: 8 }), 5000);
    expect(vi.mocked(e.showNotification).mock.calls[0][1].body).toBe('You have new mail.');
  });

  it('replaces an earlier pop-up for the same mail silently', async () => {
    const e = env({ ...named, alreadyNotified: vi.fn(async () => true) });
    await handlePush(e, push(), 5000);
    expect(vi.mocked(e.showNotification).mock.calls[0][1]).toMatchObject({ silent: true });
  });
});

describe('server-pushed nearby alerts (issue #5122)', () => {
  const NOW = Date.parse('2026-10-25T12:00:00Z');
  const HOUR = 3_600_000;
  const skyhook = {
    eventId: 'skyhookRaidableNearby' as const,
    characterId: 777,
    systemId: 30000142,
    planetId: 40009077,
    startMs: NOW + HOUR,
    endMs: NOW + 2 * HOUR,
    jumps: 2,
  };
  const incursion = {
    eventId: 'incursionNearby' as const,
    characterId: 777,
    constellationId: 20000020,
    stagingSystemId: 30000144,
    state: 'established' as const,
    jumps: 1,
  };

  /** What `functions/src/nearbyPush.ts`'s `buildNearbyPush` sends. */
  const push = (fire: typeof skyhook | typeof incursion, extra: Record<string, string> = {}) =>
    JSON.stringify({
      data: {
        characterId: '777',
        eventId: fire.eventId,
        occurrenceKey: 'server-key',
        fireAt: String(NOW),
        title: 'Generic title',
        body: 'Generic body',
        fire: JSON.stringify(fire),
        ...extra,
      },
    });

  const names = new Map([
    [30000142, 'Jita'],
    [40009077, 'Jita IV'],
    [20000020, 'Kimotoro'],
    [30000144, 'Perimeter'],
  ]);

  it('renders a raid window with the app’s own wording and resolved names', async () => {
    const e = env({ resolveIds: vi.fn(async () => names) });
    await handlePush(e, push(skyhook), NOW);
    expect(e.showNotification).toHaveBeenCalledWith(
      'Raidable skyhook 2 jumps away',
      expect.objectContaining({
        body: 'Jita IV can be raided in 1h 0m, 2 jumps from your current system.',
      })
    );
  });

  it('renders an Incursion with its state, and with ids when no name resolves', async () => {
    const e = env({ resolveIds: vi.fn(async () => new Map()) });
    await handlePush(e, push(incursion), NOW);
    expect(e.showNotification).toHaveBeenCalledWith(
      'Incursion 1 jump away',
      expect.objectContaining({
        body: 'Constellation 20000020, staging in #30000144: Established, 1 jump from your current system.',
      })
    );
  });

  it('writes the feed row under the key the Foreground Poller derives', async () => {
    const e = env();
    await handlePush(e, push(skyhook), NOW);
    expect(e.recordFeedEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: occurrenceKey(skyhook, NOW), notifiedHereAt: NOW })
    );
  });

  it('falls back to the sender’s copy for a malformed fire', async () => {
    const e = env();
    await handlePush(e, push({ ...skyhook, planetId: 'x' } as never), NOW);
    expect(e.showNotification).toHaveBeenCalledWith(
      'Generic title',
      expect.objectContaining({ body: 'Generic body' })
    );
  });
});
