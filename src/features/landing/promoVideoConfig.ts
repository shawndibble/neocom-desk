export const PROMO_VIDEO = {
  youtubeId: 'gIEbYbJ4b3k',
  duration: '1:38',
} as const;

export const PROMO_VIDEO_ANCHOR = 'login-video';

export const EMBED_IFRAME_PROPS = {
  allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
  allowFullScreen: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
} as const;

export function promoEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0&playsinline=1`;
}

export const TOUR_VIDEOS = {
  evening: { youtubeId: 'GGYrxM6qMho', duration: '5:40' },
  undock: { youtubeId: 'TrZTghXJmkA', duration: '3:23' },
  industry: { youtubeId: 'rOPpdivF4nI', duration: '3:27' },
  corp: { youtubeId: 'vKHBrUn08vE', duration: '2:58' },
} as const satisfies Record<string, { youtubeId: string; duration: string }>;

export type TourVideoId = keyof typeof TOUR_VIDEOS;
