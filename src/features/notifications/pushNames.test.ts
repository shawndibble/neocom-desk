import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import type { EveNotificationFire } from '@/engine/notificationDiffs';
import { resolvePushNames } from './pushNames';

function fire(type: string, text: string): EveNotificationFire {
  return {
    eventId: 'eveNotification',
    characterId: 1,
    notificationId: 9,
    type,
    senderId: 0,
    senderType: '',
    text,
    timestamp: '2026-10-14T11:50:00Z',
  };
}

const WAR = 'declaredByID: 98000001\nagainstID: 98000002';

describe('resolvePushNames', () => {
  it('posts the ids the body names and returns them keyed by id', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify([{ id: 98000001, name: 'Marmite Corp' }]))
    );
    const names = await resolvePushNames(fire('WarDeclared', WAR), fetchImpl as typeof fetch);

    expect(names.entities?.get(98000001)).toBe('Marmite Corp');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://esi.evetech.net/universe/names');
    expect(JSON.parse(init.body as string)).toEqual([98000001]);
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Compatibility-Date']).toBeTruthy();
    expect(headers['X-User-Agent']).toContain('Neocom Desk');
  });

  it('makes no request for a type that names nobody', async () => {
    const fetchImpl = vi.fn();
    const names = await resolvePushNames(fire('StructureFuelAlert', ''), fetchImpl);
    expect(names).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns nothing on a failed or rejected request', async () => {
    const failed = vi.fn(async () => new Response('', { status: 500 }));
    expect(await resolvePushNames(fire('WarDeclared', WAR), failed as typeof fetch)).toEqual({});
    const rejected = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await resolvePushNames(fire('WarDeclared', WAR), rejected as typeof fetch)).toEqual({});
  });

  it('gives up inside the resolution budget instead of holding the notification', async () => {
    vi.useFakeTimers();
    try {
      const hung = vi.fn(() => new Promise<Response>(() => {}));
      const pending = resolvePushNames(fire('WarDeclared', WAR), hung as unknown as typeof fetch);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await pending).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('service worker bundle weight', () => {
  // The worker has its own small i18next instance (`pushHandler.ts`); a module
  // in its graph reaching for `@/i18n` or React would put every locale back in.
  const SW_MODULES = [
    'pushHandler.ts',
    'pushNames.ts',
    'eveNotificationRender.ts',
    'eveNotificationNamePlan.ts',
    'eveTypeLabel.ts',
  ];

  it.each(SW_MODULES)('%s imports no full locale set, React or Dexie-backed lookup', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(source).not.toMatch(/from '@\/i18n'/);
    expect(source).not.toMatch(/from 'react/);
    expect(source).not.toMatch(/import \w+ from '@\/i18n\/locales\/en\.json'/);
    expect(source).not.toMatch(/from '@\/features\/character\//);
  });
});
