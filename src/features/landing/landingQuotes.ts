/** A pilot's words about the app, shown with their permission. */
export interface Quote {
  text: string;
  /** Character or corporation name the quote is credited to. */
  attribution: string;
}

/**
 * Real quotes go here, and only with the speaker's permission. Empty on
 * purpose: nothing on the landing page is invented, and the quotes row
 * renders nothing until this has an entry.
 */
export const LANDING_QUOTES: readonly Quote[] = [];
