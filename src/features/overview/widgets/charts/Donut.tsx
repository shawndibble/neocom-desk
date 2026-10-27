import { donutSegments } from './geometry';
import { CHART_COLOR } from './palette';
import type { DonutChartModel } from './types';

/** A ring split into parts, the total in the hole and a legend that names every part. */
export function Donut({ model, size }: { model: DonutChartModel; size: number }) {
  const segments = donutSegments(model.parts.map((part) => part.value));
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
                strokeDasharray={`${segment.dash.toFixed(2)} ${segment.gap.toFixed(2)}`} // fixed format: SVG attribute
                strokeDashoffset={segment.offset.toFixed(2)} // fixed format: SVG attribute
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center leading-tight font-semibold tabular-nums">
          <span>
            {model.centre}
            <small className="block text-[0.625rem] font-normal text-text-dim">
              {model.centreNote}
            </small>
          </span>
        </div>
      </div>
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
    </div>
  );
}
