export interface Screenshot {
  file: string;
  key: string;
  size: { width: number; height: number };
}

export const DESKTOP_SIZE = { width: 1600, height: 900 };
export const PHONE_SIZE = { width: 540, height: 1104 };

export function screenshotSrc(shot: Pick<Screenshot, 'file'>): string {
  return `/screenshots/${shot.file}.webp`;
}

export const DESKTOP_VARIANT_WIDTHS = [640, 1280];
export const PHONE_VARIANT_WIDTHS = [416];

export function screenshotVariantWidths(shot: Pick<Screenshot, 'size'>): number[] {
  return shot.size.width === PHONE_SIZE.width ? PHONE_VARIANT_WIDTHS : DESKTOP_VARIANT_WIDTHS;
}

function screenshotVariantSrc(shot: Pick<Screenshot, 'file'>, width: number): string {
  return `/screenshots/${shot.file}-${width}.webp`;
}

export function screenshotSrcSet(shot: Pick<Screenshot, 'file' | 'size'>): string {
  return [
    ...screenshotVariantWidths(shot).map((w) => `${screenshotVariantSrc(shot, w)} ${w}w`),
    `${screenshotSrc(shot)} ${shot.size.width}w`,
  ].join(', ');
}
