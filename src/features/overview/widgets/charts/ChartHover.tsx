import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { PointTooltip } from '@/components/ui/PointTooltip';
import { cx } from '@/lib/cx';
import { ChartTipBody } from './ChartTipBody';
import type { ChartTip } from './types';

export function ChartHover({
  tips,
  layout,
  dotY,
  className,
  style,
  children,
}: {
  tips: readonly ChartTip[] | undefined;
  layout: 'columns' | 'points';
  dotY?: readonly number[];
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const count = tips?.length ?? 0;
  const live = active !== null && active < count;

  const xOf = (i: number) =>
    layout === 'columns' ? (i + 0.5) / count : count > 1 ? i / (count - 1) : 0.5;
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));

  function pick(event: PointerEvent) {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const fraction = (event.clientX - box.left) / box.width;
    setActive(
      clamp(
        layout === 'columns' ? Math.floor(fraction * count) : Math.round(fraction * (count - 1))
      )
    );
  }

  useEffect(() => {
    if (!live) return;
    const dismiss = (event: Event) => {
      if (event.type === 'pointerdown' && ref.current?.contains(event.target as Node)) return;
      setActive(null);
    };
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [live]);

  if (!tips || count === 0) {
    return (
      <div className={cx('relative', className)} style={style}>
        {children}
      </div>
    );
  }

  const tip = live ? tips[active] : undefined;
  const x = live ? xOf(active) : 0;
  const dot = live ? dotY?.[active] : undefined;
  return (
    <div
      ref={ref}
      className={cx('relative touch-pan-y', className)}
      style={style}
      onPointerEnter={pick}
      onPointerMove={pick}
      onPointerDown={(e) => e.pointerType === 'touch' && pick(e)}
      onPointerLeave={(e) => e.pointerType !== 'touch' && setActive(null)}
    >
      {children}
      {tip && (
        <>
          {layout === 'columns' ? (
            <i
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 bg-text/10"
              style={{ left: `${(active! / count) * 100}%`, width: `${100 / count}%` }}
            />
          ) : (
            <i
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-px bg-line-bright"
              style={{ left: `${x * 100}%` }}
            />
          )}
          {dot !== undefined && (
            <i
              aria-hidden="true"
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${x * 100}%`, top: `${dot * 100}%` }}
            />
          )}
        </>
      )}
      <PointTooltip
        open={tip !== undefined}
        onClose={() => setActive(null)}
        anchor={
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-full w-0"
            style={{ left: `${x * 100}%` }}
          />
        }
      >
        {tip && (
          <ChartTooltipShell>
            <ChartTipBody tip={tip} />
          </ChartTooltipShell>
        )}
      </PointTooltip>
    </div>
  );
}
