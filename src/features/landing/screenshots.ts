/**
 * One captured screen on the landing page: the file under `public/screenshots/`
 * and the `login.screenshots.*` key its alt text and enlarged-view caption live
 * under. Real captures filled with sample data, not mockups. `screenshots/` is
 * excluded from the PWA precache (vite.config.ts), so a signed-in user never
 * downloads them.
 */
export interface Screenshot {
  file: string;
  key: string;
  size: { width: number; height: number };
}

/** Every capture of one form factor was encoded at the same size. */
export const DESKTOP_SIZE = { width: 1600, height: 900 };
export const PHONE_SIZE = { width: 540, height: 1104 };

export function screenshotSrc(shot: Pick<Screenshot, 'file'>): string {
  return `/screenshots/${shot.file}.webp`;
}
