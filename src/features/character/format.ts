import { clampIskZero } from '@/lib/isk';

export function iskToneClass(value: number): string {
  return clampIskZero(value, 2) < 0 ? 'text-isk-neg' : 'text-isk-pos';
}

export function netToneClass(value: number): string {
  return clampIskZero(value, 0) === 0 ? '' : iskToneClass(value);
}

export function humanizeRefType(refType: string): string {
  const words = refType.split('_').join(' ');
  if (words.length === 0) return words;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
