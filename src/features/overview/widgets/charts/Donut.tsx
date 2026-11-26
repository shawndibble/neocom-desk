import { donutSegments } from './geometry';
import { CHART_COLOR } from './palette';
import type { DonutChartModel } from './types';

export function Donut({
  model,
  size,
  legend = true,
}: {
  model: DonutChartModel;
  size: number;
  legend?: boolean;
}) {
  const values = model.parts.map((part) => part.value);
  const sum = values.reduce((total, value) => total + Math.max(0, value), 0);
  const segments = donutSegments(
    model.of === undefined ? values : [...values, Math.max(0, model.of - sum)]
  ).slice(0, values.length);
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg viewBox="0 0 42 42" width={size} height={size} className="block -rotate-90">
          <circle
            cx="21"
            cy="21"
            r="15.9155"
            fill="none"
            strokeWidth="5"
            stroke="var(--color-panel-2)"
          />
          {segments.map((segment, i) => {
            const part = model.parts[i]!;
            return segment.dash === 0 ? null : (
              <circle
                key={part.key}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                strokeWidth="5"
                stroke={CHART_COLOR[part.color]}
                strokeDasharray={`${segment.dash.toFixed(2)} ${segment.gap.toFixed(2)}`}
                strokeDashoffset={segment.offset.toFixed(2)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center leading-tight font-semibold tabular-nums">
          <span>
            {model.centre}
            <small className="block text-[0.6875rem] font-normal text-text-dim">
              {model.centreNote}
            </small>
          </span>
        </div>
      </div>
      {legend && (
        <ul className="grid min-w-0 gap-0.5 text-xs text-text-dim">
          {model.parts.map((part) => (
            <li key={part.key} className="flex items-center gap-1.5">
              <i
                className="inline-block size-2 flex-none rounded-[1px]"
                style={{ backgroundColor: CHART_COLOR[part.color] }}
              />
              <span className="min-w-0 truncate">
                {part.label} <span className="tabular-nums">{part.value}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
