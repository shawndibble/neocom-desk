import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import { controlHeightClassName, interactiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { PRIORITY_ORDER } from '@/engine/skills/planPriority';
import type { PlanPriority } from '@/engine/types';
import type { AttributePair } from '../attributePairBands';
import { TIME_CELL, attributePairLabel, priorityLabelKey } from './rowChrome';

type AttributePairBadgeProps = AttributePair;

export function AttributePairBadge({ primary, secondary }: AttributePairBadgeProps) {
  const { t } = useTranslation();
  const label = attributePairLabel(primary, secondary);
  return (
    <span className="px-1 text-[0.6875rem] tracking-widest text-text-dim uppercase">
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">
        {t('plans.attributePairFull', {
          primary: t(`skills.attr.${primary}`),
          secondary: t(`skills.attr.${secondary}`),
        })}
      </span>
    </span>
  );
}

interface TimeCellProps {
  value: string;
  dim?: boolean;
  fixedWidth?: boolean;
  label?: string;
}

export function TimeCell({ value, dim = false, fixedWidth = true, label }: TimeCellProps) {
  return (
    <span
      className={`${fixedWidth ? TIME_CELL : 'shrink-0 whitespace-nowrap'} tabular-nums ${
        dim ? 'text-text-dim' : ''
      }`}
    >
      {label && <span className="sr-only">{label}: </span>}
      {value}
    </span>
  );
}

export function MetaValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-text-dim">{label}</span> {value}
    </span>
  );
}

const PRIORITY_TONE: Record<PlanPriority, string> = {
  high: 'border-line-bright text-text',
  normal: 'border-line text-text-dim',
  low: 'border-line text-text-dim italic',
};

interface PriorityPillProps {
  skillTypeID: number;
  name: string;
  priority: PlanPriority;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
  touchTarget?: boolean;
}

export function PriorityPill({
  skillTypeID,
  name,
  priority,
  onSetPriority,
  touchTarget = false,
}: PriorityPillProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('plans.priorityLabel', { priority: t(priorityLabelKey(priority)), name })}
          className={`group inline-flex items-center lg:scroll-mt-40 ${touchTarget ? controlHeightClassName.sm : ''}`}
        >
          <span
            className={`${interactiveClassName} rounded-xs border px-1 text-[0.6875rem] tracking-widest uppercase group-hover:border-line-bright group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-accent ${PRIORITY_TONE[priority]}`}
          >
            {t(priorityLabelKey(priority))}
            <Icon.Expanded
              aria-hidden="true"
              className="ml-0.5 inline-block size-3 align-[-0.125em]"
            />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PRIORITY_ORDER.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onSetPriority(skillTypeID, option)}>
            {t(priorityLabelKey(option))}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
