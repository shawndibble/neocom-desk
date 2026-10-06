import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { IskFigureGroupContext } from './tooltipHold';

const FIGURE = '[data-isk-figure]';
const MOVE_KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];

/**
 * One tab stop for every `IskAmount` inside, a roving tabindex: Tab lands on
 * the last-focused figure (the first, initially), arrow keys / Home / End move
 * between figures, Tab leaves. Each figure still shows its exact value on
 * focus. For a dense card or panel where a stop per figure buries the real
 * controls. Arrow keys act only while a figure has focus, so inputs and
 * selects inside the group keep theirs.
 */
export function IskFigureGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<Element | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const sync = () => {
      const figures = Array.from(root.querySelectorAll<HTMLElement>(FIGURE));
      const stop =
        active.current && figures.includes(active.current as HTMLElement)
          ? active.current
          : figures[0];
      for (const f of figures) f.tabIndex = f === stop ? 0 : -1;
    };
    sync();
    // Rows come and go (a tick, a re-rank) without this component re-rendering.
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const onFocus = (e: React.FocusEvent) => {
    const target = e.target as HTMLElement;
    if (!target.matches(FIGURE)) return;
    active.current = target;
    for (const f of ref.current?.querySelectorAll<HTMLElement>(FIGURE) ?? [])
      f.tabIndex = f === target ? 0 : -1;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (!MOVE_KEYS.includes(e.key) || !target.matches(FIGURE)) return;
    const figures = Array.from(ref.current?.querySelectorAll<HTMLElement>(FIGURE) ?? []);
    const at = figures.indexOf(target);
    const last = figures.length - 1;
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? last
          : e.key === 'ArrowRight' || e.key === 'ArrowDown'
            ? Math.min(at + 1, last)
            : Math.max(at - 1, 0);
    e.preventDefault();
    figures[next]?.focus();
  };

  return (
    <IskFigureGroupContext.Provider value={true}>
      <div ref={ref} className={className} onFocus={onFocus} onKeyDown={onKeyDown}>
        {children}
      </div>
    </IskFigureGroupContext.Provider>
  );
}
