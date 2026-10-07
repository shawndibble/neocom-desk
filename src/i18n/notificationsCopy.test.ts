import { describe, expect, it } from 'vitest';
import en from './locales/en.json';

describe('notifications copy', () => {
  const notifications = en.settings.notifications;

  it('does not claim every choice stays on this device', () => {
    expect(notifications.hint).not.toMatch(/These choices stay on this device/);
    expect(notifications.hint).toMatch(/sync/);
  });

  it('names the Alerts page, never Overview, as the feed location', () => {
    expect(JSON.stringify(notifications)).not.toMatch(/Overview/);
  });
});
