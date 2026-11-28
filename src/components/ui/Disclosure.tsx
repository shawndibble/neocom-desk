import { eyebrowClassName } from './eyebrowClassName';
import type { ReactNode, Ref } from 'react';
import { cx } from '@/lib/cx';
import { Collapse } from './Collapse';
import {
  focusRingClassName,
  focusRingInsetClassName,
  rowInteractiveClassName,
} from './controlStyles';
import * as Icon from './icons';

interface DisclosureProps {
  label: ReactNode;
  labelAccessory?: ReactNode;
  trailing?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}

export function Caret({ expanded, opensUp = false }: { expanded: boolean; opensUp?: boolean }) {
  const Glyph = expanded ? Icon.Expanded : Icon.Descend;
  return (
    <Glyph
      size={Icon.ICON_SIZE.sm}
      aria-hidden="true"
      className={`shrink-0 text-text-faint ${expanded && opensUp ? 'rotate-180' : ''}`}
    />
  );
}

export function CaretToggle({
  expanded,
  label,
  onClick,
  toggleRef,
}: {
  expanded: boolean;
  label: string;
  onClick: () => void;
  toggleRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={toggleRef}
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
      className={`flex size-9 shrink-0 items-center justify-center ${focusRingClassName}`}
    >
      <Caret expanded={expanded} />
    </button>
  );
}

export function Disclosure({
  label,
  labelAccessory,
  trailing,
  expanded,
  onToggle,
  children,
  className = '',
}: DisclosureProps) {
  const labelContent = (
    <span className={cx(eyebrowClassName, 'flex min-w-0 items-center gap-1.5')}>
      <Caret expanded={expanded} />
      {label}
    </span>
  );
  const trailingContent = trailing !== undefined && (
    <span className="text-[0.6875rem] font-medium tabular-nums text-text">{trailing}</span>
  );
  const body = (
    <Collapse
      open={expanded}
      closeInstantly
      className="divide-y divide-line border-t border-line bg-panel-2"
    >
      {children}
    </Collapse>
  );

  if (labelAccessory !== undefined) {
    return (
      <div className={className}>
        <div
          onClick={onToggle}
          className={cx(
            'flex min-h-9 w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 md:min-h-0',
            rowInteractiveClassName
          )}
        >
          <button
            type="button"
            aria-expanded={expanded}
            className={cx('text-left', focusRingClassName)}
          >
            {labelContent}
            {trailing !== undefined && <span className="sr-only">{trailing}</span>}
          </button>
          <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
            {labelAccessory}
          </span>
          <span className="ml-auto" aria-hidden="true">
            {trailingContent}
          </span>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cx(
          'flex min-h-9 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left md:min-h-0',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        {labelContent}
        {trailingContent}
      </button>
      {body}
    </div>
  );
}
