# Scope decisions — Allow @summary JSDoc in src/components/ui for ui:catalog

_Recorded 2026-11-27._

- **A JSDoc block whose first tag is `@summary` is allowed on a primitive, its props and its stories.** #6763 banned every comment and stripped them, which left `npm run ui:catalog` printing "(no summary)" for every primitive and DESIGN §4 still promising summaries. The owner picked allowing them again (UX audit S-174). `local/no-comments` skips that one block form; any other comment is still an error. Summaries were restored from before #6763 (summary line only, not the prose around it).
- **Also fixed.** `ui:catalog` failed on any component whose props use `ControlSize` (FilterChip, Select, ...): react-docgen reads the root `tsconfig.json`, a solution file with no `paths`, so `@/lib/cx` did not resolve. The root file now carries the `@/*` path.
