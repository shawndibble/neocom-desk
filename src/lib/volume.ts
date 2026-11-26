import { createNumberFormat } from './numberLocale';

const VOLUME_FORMAT = createNumberFormat({ maximumFractionDigits: 2 });
const TINY_VOLUME_FORMAT = createNumberFormat({ maximumFractionDigits: 4 });

export function formatCubicMetres(value: number): string {
  const format = value > 0 && value < 0.01 ? TINY_VOLUME_FORMAT : VOLUME_FORMAT;
  return format(value);
}

export function formatUnitVolume(value: number): string {
  return `${formatCubicMetres(value)} m³`;
}
