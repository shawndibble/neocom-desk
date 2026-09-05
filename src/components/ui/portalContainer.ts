import { createContext, useContext } from 'react';

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * The element a Radix overlay should portal into, when the default
 * (`document.body`) is wrong.
 *
 * `Modal` is built on the native `<dialog>` + `showModal()`, which puts the
 * dialog in the browser's *top layer* and makes everything outside it inert. A
 * `Select` opened from inside that dialog portals to `document.body` by
 * default — below the top layer and inside the inert subtree, so its list
 * renders behind the modal and cannot be clicked. `Modal` publishes its own
 * scroll container here and `SelectContent` reads it, so a select inside a
 * modal works with no change at the call site.
 */
export const PortalContainerProvider = PortalContainerContext.Provider;

export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext);
}
