import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Issue #4777 mockup parts. The proposal adds a line and a column inside
 * existing components, so rather than copy those components the stories render
 * the real pages and `Inject` adds the new pieces into their DOM, each in a
 * dashed outline (`scoreTitleTargets.tsx`). Mockup-only: the real build
 * changes the components.
 */

export interface InjectTarget {
  key: string;
  anchor: Element;
  /** `after` (default) inserts a sibling; `append` adds a last child. */
  where?: 'after' | 'append';
  shell: () => HTMLElement;
  content: ReactNode;
}

interface Slot {
  key: string;
  node: HTMLElement;
  content: ReactNode;
}

/** Keeps each target's node in the page as it re-renders. `find` must be module-level. */
export function Inject({ find }: { find: () => InjectTarget[] }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  useEffect(() => {
    const placed = new Map<string, Slot>();
    let frame = 0;
    const scan = () => {
      frame = 0;
      let changed = false;
      for (const target of find()) {
        if (placed.get(target.key)?.node.isConnected) continue;
        const node = target.shell();
        node.dataset.mockInjected = target.key;
        if (target.where === 'append') target.anchor.append(node);
        else target.anchor.after(node);
        placed.set(target.key, { key: target.key, node, content: target.content });
        changed = true;
      }
      if (changed) setSlots([...placed.values()]);
    };
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(scan);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      placed.forEach((slot) => slot.node.remove());
    };
  }, [find]);
  return <>{slots.map((slot) => createPortal(slot.content, slot.node, slot.key))}</>;
}
