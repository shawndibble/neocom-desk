const EVE_IMAGE_ORIGIN = 'https://images.evetech.net';
const SNAPSHOT_ORIGIN = 'https://data.neocomdesk.com';

export function isVersionedSdeData(
  url: URL,
  requestMode: RequestMode,
  selfOrigin: string,
  baseUrl: string
): boolean {
  return (
    requestMode !== 'navigate' &&
    url.origin === selfOrigin &&
    url.pathname.startsWith(`${baseUrl}data/`) &&
    url.searchParams.has('v')
  );
}

export function isLazyChunk(
  url: URL,
  requestMode: RequestMode,
  selfOrigin: string,
  baseUrl: string
): boolean {
  return (
    requestMode !== 'navigate' &&
    url.origin === selfOrigin &&
    url.pathname.startsWith(`${baseUrl}assets/`) &&
    /\.(js|css)$/.test(url.pathname)
  );
}

export function isEveTypeImage(url: URL): boolean {
  return url.origin === EVE_IMAGE_ORIGIN && url.pathname.startsWith('/types/');
}

export function isEvePortraitImage(url: URL): boolean {
  return (
    url.origin === EVE_IMAGE_ORIGIN && /^\/(characters|corporations|alliances)\//.test(url.pathname)
  );
}

export function isContractSnapshotObject(url: URL): boolean {
  return (
    url.origin === SNAPSHOT_ORIGIN &&
    (url.pathname.startsWith('/contract-offers/types/') ||
      url.pathname.startsWith('/courier-contracts/rows.'))
  );
}
