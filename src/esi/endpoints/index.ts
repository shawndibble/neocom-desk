/**
 * Thin typed wrappers over the ESI endpoints Neocom Desk v1 consumes.
 * Field names verified against https://esi.evetech.net/meta/openapi.json
 * (2026-08). Optional fields mirror the spec's non-required properties.
 *
 * Every wrapper passes its own name as `endpointId` on the `esiFetch`/
 * `fetchAllPagesStatus` call — that's the same key `ESI_REGISTRY` uses, so
 * the activity log (issue #32) can name the endpoint without a second
 * registry, and `endpointId` being typed `EsiEndpointId` makes a typo a
 * compile error.
 *
 * Split by domain (issue #4114). This barrel re-exports every file so
 * `@/esi/endpoints` keeps resolving unchanged; add new wrappers to the
 * matching domain file, not here.
 */
export * from './options';
export * from './assets';
export * from './character';
export * from './contacts';
export * from './contracts';
export * from './corp';
export * from './fittings';
export * from './industry';
export * from './mail';
export * from './market';
export * from './pi';
export * from './ui';
export * from './universe';
export * from './wallet';
export * from './wars';
