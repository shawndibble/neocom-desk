import { describe, it, expect, vi } from 'vitest';
import '@/i18n';
import type { MailNotificationFire } from '@/engine/notificationDiffs';
import type { CharacterRef } from './foregroundPoller';
import {
  sendBackgroundNotification,
  backgroundPermission,
  backgroundDependencies,
} from './backgroundPoller';

vi.mock('./foregroundPoller', async () => {
  const actual = await vi.importActual<typeof import('./foregroundPoller')>('./foregroundPoller');
  return {
    ...actual,
    liveDependencies: vi.fn(() => ({ marker: 'live' }) as unknown as ReturnType<
      typeof actual.liveDependencies
    >),
  };
});

const CHAR: CharacterRef = { characterId: 1, name: 'Test Pilot' };
const FIRE: MailNotificationFire = { eventId: 'newMail', characterId: 1, mailId: 42 };

function registration(overrides: Partial<ServiceWorkerRegistration> = {}): ServiceWorkerRegistration {
  return {
    showNotification: vi.fn(async () => {}),
    ...overrides,
  } as unknown as ServiceWorkerRegistration;
}

describe('sendBackgroundNotification', () => {
  it('calls showNotification with the same copy the foreground poller renders', async () => {
    const reg = registration();
    await sendBackgroundNotification(reg, FIRE, CHAR);
    expect(reg.showNotification).toHaveBeenCalledWith('New mail', {
      body: 'Test Pilot has new mail.',
    });
  });

  it('swallows a rejection from showNotification (permission revoked mid-flight)', async () => {
    const reg = registration({
      showNotification: vi.fn(async () => {
        throw new Error('denied');
      }),
    });
    await expect(sendBackgroundNotification(reg, FIRE, CHAR)).resolves.toBeUndefined();
  });
});

describe('backgroundPermission', () => {
  it('is "granted" when the registration can show notifications', () => {
    expect(backgroundPermission(registration())).toBe('granted');
  });

  it('is "unsupported" when showNotification is absent', () => {
    expect(
      backgroundPermission({} as ServiceWorkerRegistration)
    ).toBe('unsupported');
  });
});

describe('backgroundDependencies', () => {
  it('overrides notify/permission but keeps every other liveDependencies() field', async () => {
    const reg = registration();
    const deps = backgroundDependencies(reg);

    expect((deps as unknown as { marker: string }).marker).toBe('live');
    expect(deps.permission()).toBe('granted');

    await deps.notify(FIRE, CHAR);
    expect(reg.showNotification).toHaveBeenCalledWith('New mail', {
      body: 'Test Pilot has new mail.',
    });
  });
});
