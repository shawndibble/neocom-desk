export interface EndpointOptions {
  etag?: string;
  signal?: AbortSignal;
  pageEtags?: ReadonlyArray<string | undefined>;
}
