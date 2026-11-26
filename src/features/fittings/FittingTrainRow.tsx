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
  return (
    <li className={statRowClassName()}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {title}
          {detail && <div className={`${STAT_DETAIL} line-clamp-2`}>{detail}</div>}
          {status && <div className={STAT_DETAIL}>{status}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span className="min-w-[4.5rem] text-right whitespace-nowrap tabular-nums">{time}</span>
            {action}
          </div>
          {prerequisites}
        </div>
      </div>
    </li>
  );
}
