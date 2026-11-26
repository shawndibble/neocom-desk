export const PROMO_VIDEO = {
  youtubeId: 'gIEbYbJ4b3k',
  duration: '1:38',
} as const;

export const PROMO_VIDEO_ANCHOR = 'login-video';

export function promoEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0&playsinline=1`;
}
