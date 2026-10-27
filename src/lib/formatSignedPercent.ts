import { createNumberFormat } from './numberLocale';

const formatOneDecimal = createNumberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * A percent difference with its direction: "+2.4%", "−6.9%" (a true minus, not
 * a hyphen), one decimal. A figure that rounds to zero carries no sign, so the
 * reader is not told a 0.0% gap leans either way.
 */
export function formatSignedPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  const body = `${formatOneDecimal(Math.abs(rounded))}%`;
  if (rounded === 0) return body;
  return `${rounded < 0 ? '−' : '+'}${body}`;
}

/**
 * Which way a percent difference leans, judged on what `formatSignedPercent`
 * would print: a gap that shows as 0.0% is "level", so the words never say
 * "below" beside a figure that reads as no difference.
 */
export function percentDirection(percent: number): 'below' | 'above' | 'level' {
  const rounded = Math.round(percent * 10) / 10;
  return rounded < 0 ? 'below' : rounded > 0 ? 'above' : 'level';
}
