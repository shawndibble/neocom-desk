import type { PiData } from '@/sde/types';
import { createNumberFormat } from '@/lib/numberLocale';

const UNITS_FORMAT = createNumberFormat({ maximumFractionDigits: 2 });

export function formatUnits(value: number): string {
  return UNITS_FORMAT(value);
}

export function commodityName(typeId: number, pi: PiData): string {
  return (
    pi.schematics[String(typeId)]?.name ??
    pi.raw.find((resource) => resource.typeID === typeId)?.name ??
    String(typeId)
  );
}

export function parseDecimal(text: string): number | null {
  const normalised = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}
