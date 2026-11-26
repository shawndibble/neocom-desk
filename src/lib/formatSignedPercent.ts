import { createNumberFormat } from './numberLocale';

const formatOneDecimal = createNumberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatSignedPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  const body = `${formatOneDecimal(Math.abs(rounded))}%`;
  if (rounded === 0) return body;
  return `${rounded < 0 ? '−' : '+'}${body}`;
}

export function percentDirection(percent: number): 'below' | 'above' | 'level' {
  const rounded = Math.round(percent * 10) / 10;
  return rounded < 0 ? 'below' : rounded > 0 ? 'above' : 'level';
}

export function savingTone(percent: number): 'good' | 'bad' {
  return Math.round(percent * 10) / 10 < 0 ? 'bad' : 'good';
}
