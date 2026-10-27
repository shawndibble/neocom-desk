/** Full-page navigation wrapper so tests can mock it (jsdom cannot navigate). */
export function assignLocation(url: string): void {
  window.location.assign(url);
}
