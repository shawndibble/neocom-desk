/** Options a caller may tune per request (conditional GET, cancellation). */
export interface EndpointOptions {
  etag?: string;
  signal?: AbortSignal;
  /** Paginated getters only: one If-None-Match per page — see `fetchAllPagesStatus`. */
  pageEtags?: ReadonlyArray<string | undefined>;
}
