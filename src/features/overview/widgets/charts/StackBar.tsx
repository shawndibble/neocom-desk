import { stackPercents } from './geometry';
import { CHART_COLOR } from './palette';
import type { StackChartModel } from './types';

/** One bar split into parts, with a legend in bar order so colour is never the only signal. */
export function StackBar({ model }: { model: StackChartModel }) {
  const percents = stackPercents(model.parts.map((part) => part.value));
  return (
    <div aria-hidden="true" className="grid gap-1.5">
      <div className="flex h-3.5 gap-px overflow-hidden rounded-[1px]">
        {model.parts.map((part, i) => (
          <i
            key={part.key}
            className="block h-full"
            style={{
              width: `${percents[i]!.toFixed(1)}%`, // fixed format: CSS width
              backgroundColor: CHART_COLOR[part.color],
            }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-dim">
        {model.parts
          .filter((part) => !part.unlabelled)
          .map((part) => (
            <li key={part.key} className="flex items-center gap-1.5">
              <i
                className="inline-block size-2 flex-none rounded-[1px]"
                style={{ backgroundColor: CHART_COLOR[part.color] }}
              />
              <span>
                {part.label} <span className="tabular-nums">{part.text}</span>
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
