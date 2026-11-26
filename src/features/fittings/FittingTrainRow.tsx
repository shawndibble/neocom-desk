import type { ReactNode } from 'react';
import { STAT_DETAIL, statRowClassName } from './statKit';

interface Props {
  title: ReactNode;
  detail?: ReactNode;
  status?: ReactNode;
  time: ReactNode;
  prerequisites?: ReactNode;
  action?: ReactNode;
}

export function TrainRow({ title, detail, status, time, prerequisites, action }: Props) {
  const hasSecondLine = Boolean(detail || status || prerequisites);
  const timing = (
    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap tabular-nums">
      <span className={hasSecondLine ? undefined : 'min-w-[4.5rem] text-right'}>{time}</span>
      {prerequisites}
    </div>
  );
  return (
    <li className={statRowClassName()}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">{title}</div>
        <div className="flex shrink-0 items-center gap-3">
          {!hasSecondLine && timing}
          {action}
        </div>
      </div>
      {hasSecondLine && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-[9rem] flex-1">
            {detail && <div className={`${STAT_DETAIL} line-clamp-2`}>{detail}</div>}
            {status && <div className={STAT_DETAIL}>{status}</div>}
          </div>
          <div className="ml-auto">{timing}</div>
        </div>
      )}
    </li>
  );
}
