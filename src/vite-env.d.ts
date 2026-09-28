/** Injected by `vite.config.ts`'s `define` from `package.json`'s version. */
declare const __APP_VERSION__: string;
/** The pinned dogma-engine and SDE versions, from `package.json` via `vite.config.ts`. */
declare const __DOGMA_PINS__: string;
/**
 * Content hash per `public/data/**` file, keyed by its path under `data/`
 * (`types.json`, `market/types.json`) — see `src/sde/sdeDataUrl.ts`.
 */
declare const __SDE_DATA_VERSIONS__: Readonly<Record<string, string>>;
