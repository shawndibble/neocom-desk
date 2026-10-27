import type { EsiEndpointId } from '@/esi/registry';

/**
 * Pages that show their own login banner for one endpoint. The shell's
 * "EVE access was refused" notice stays quiet for that endpoint on that page,
 * so a refusal reads as one banner with one login button, not two.
 */
const PAGE_BANNERS: readonly { path: string; endpointId: EsiEndpointId }[] = [
  { path: '/planetary-industry', endpointId: 'getCharacterPlanets' },
];

export function pageOwnsReauth(pathname: string, endpointId: EsiEndpointId | undefined): boolean {
  return PAGE_BANNERS.some(
    (page) =>
      page.endpointId === endpointId &&
      (pathname === page.path || pathname.startsWith(`${page.path}/`))
  );
}
