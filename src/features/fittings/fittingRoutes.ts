/**
 * The Fittings section's own paths. The Start screen (the library: hulls,
 * Load, My and In-game Fittings) is `/fittings`; an open Fitting is
 * `/fittings/edit?f=<Share Link code>`, so opening one is a history entry
 * Back can return from. `/fittings?f=` — every Share Link ever copied — still
 * works: the route redirects it here.
 */
export const FITTINGS_PATH = '/fittings';
export const FITTING_EDIT_PATH = '/fittings/edit';

/** The editor's location for a Share Link code. */
export function fittingEditLocation(code: string): { pathname: string; search: string } {
  return { pathname: FITTING_EDIT_PATH, search: `?${new URLSearchParams({ f: code })}` };
}
