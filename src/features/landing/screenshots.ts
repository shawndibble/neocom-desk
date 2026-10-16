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

/** The full-size original: the fallback `src` and what the enlarged view shows. */
export function screenshotSrc(shot: Pick<Screenshot, 'file'>): string {
  return `/screenshots/${shot.file}.webp`;
}

/**
 * Smaller widths generated from each original by `npm run shots:resize`, as
 * `<file>-<width>.webp` beside it. Every variant keeps the original's aspect
 * ratio, so the `width`/`height` attributes still reserve the right box.
 */
export const DESKTOP_VARIANT_WIDTHS = [640, 1280];
export const PHONE_VARIANT_WIDTHS = [416];

export function screenshotVariantWidths(shot: Pick<Screenshot, 'size'>): number[] {
  return shot.size.width === PHONE_SIZE.width ? PHONE_VARIANT_WIDTHS : DESKTOP_VARIANT_WIDTHS;
}

function screenshotVariantSrc(shot: Pick<Screenshot, 'file'>, width: number): string {
  return `/screenshots/${shot.file}-${width}.webp`;
}

/** `srcset` for a thumbnail: every smaller variant plus the original. */
export function screenshotSrcSet(shot: Pick<Screenshot, 'file' | 'size'>): string {
  return [
    ...screenshotVariantWidths(shot).map((w) => `${screenshotVariantSrc(shot, w)} ${w}w`),
    `${screenshotSrc(shot)} ${shot.size.width}w`,
  ].join(', ');
}
