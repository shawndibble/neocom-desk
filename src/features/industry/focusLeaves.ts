import type { FocusEvent } from 'react';

/** Calls `onLeave` once focus has left `event.currentTarget` altogether. */
export function whenFocusLeaves(onLeave: () => void) {
  return (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave();
  };
}
