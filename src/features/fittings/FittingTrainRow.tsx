import type { ReactNode } from 'react';
import { STAT_DETAIL, statRowClassName } from './statKit';

interface Props {
  title: ReactNode;
  detail?: ReactNode;
  time: ReactNode;
  prerequisites?: ReactNode;
  action?: ReactNode;
}

export function TrainRow({ title, detail, time, prerequisites, action }: Props) {
  return (
    <li className={statRowClassName()}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {title}
          {detail && <div className={`${STAT_DETAIL} line-clamp-2`}>{detail}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span className="min-w-[4.5rem] text-right tabular-nums">{time}</span>
            {action}
          </div>
          {prerequisites}
        </div>
      </div>
    </li>
  );
}
