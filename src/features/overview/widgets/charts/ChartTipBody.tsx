import type { ChartTip } from './types';

const TONE_CLASS = { good: 'text-isk-pos', bad: 'text-isk-neg', plain: 'text-text' } as const;

/** A hover readout's title and labelled figures; the caller wraps it in its own bubble. */
export function ChartTipBody({ tip }: { tip: ChartTip }) {
  return (
    <>
      <b className="mb-1 block font-semibold text-text">{tip.title}</b>
      {tip.rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <span>{row.label}</span>
          <span className={TONE_CLASS[row.tone ?? 'plain']}>{row.value}</span>
        </div>
      ))}
    </>
  );
}
