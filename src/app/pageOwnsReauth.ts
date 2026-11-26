import type { EsiEndpointId } from '@/esi/registry';

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
