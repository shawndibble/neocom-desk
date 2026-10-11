/**
 * The only route the retired `/alerts` redirect points at, and the one the
 * `?alerts=1` flag opens the bell panel on. Its own module so the redirect and
 * the panel provider share it without either importing the other.
 */
export const ALERTS_PANEL_PATH = '/overview';
