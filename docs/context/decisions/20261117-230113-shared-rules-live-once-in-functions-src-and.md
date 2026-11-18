# Scope decisions — Shared rules live once in functions/src and src imports them

_Recorded 2026-11-17._

- **A rule needed by both the client and the Cloud Functions lives once, in `functions/src`; the `src/` path is a re-export.** Replaces hand-mirrored copies policed by byte-equality or parity tests. Moved: `vettingEngine`, `skyhookAlert`, `jumpRoute`, `guards`, `chunk`, `asyncPool` (`src/engine/vetting.ts` etc. now `export *` from them). The mirror and parity tests are deleted.
- **Why this direction.** `src` may import `functions/src` by relative path (whitelisted in `tsconfig.src.json` `include`). The reverse is impossible: `firebase.json` deploys `functions/` alone and `functions/` has no `@/` alias.
- **Condition.** A shared file stays dependency-free: no imports beyond siblings in `functions/src`, no `jose`/`firebase-admin`, and no fetch/DOM/Dexie (the `src/engine` purity rule still holds).
- **Follow-up.** The Corp Tax Book engine mirrors (`corpTaxBookEngine`, `corpTaxBookSyncEngine`) and their parity tests are a later PR; `incursionAlert` and `srpPricing` still have byte-compare mirrors.
