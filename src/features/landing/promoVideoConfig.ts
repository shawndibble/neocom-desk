/**
 * The promo video on the Login page: hosted on YouTube, shown as a local poster
 * until the visitor presses play (docs/context/decisions/, "promo video").
 *
 * The hero's "Watch" link is in the prerendered shell, so changing `duration`
 * regenerates `landingShell.snapshot.html`
 * (`npx vitest run src/features/landing/landingShell.test.tsx -u`).
 */
export const PROMO_VIDEO = {
  youtubeId: 'wl0xIgaw2SQ',
  /** Shown on the poster and the hero link, as m:ss. Update it with each new cut. */
  duration: '1:38',
} as const;

/** The section's element id: the hero link's target and a shareable `/login#login-video`. */
export const PROMO_VIDEO_ANCHOR = 'login-video';

/**
 * The player URL for a click that already chose to watch: the privacy-enhanced
 * youtube-nocookie host (no cookies until playback), autoplaying because the
 * click was the play press, and related videos limited to this channel.
 */
export function promoEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0&playsinline=1`;
}
