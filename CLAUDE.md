# NeoCom Desk — agent instructions

- Read `CONTEXT.md` first: glossary + scope decisions. Use its terms exactly.
- Design tokens/components: `docs/DESIGN.md`. Decisions: `docs/adr/`.
- TDD for all calculation/logic modules (`src/engine`, `src/auth`, industry
  math): failing test first, then code.
- Pure engines stay pure: no fetch/DOM/Dexie imports in `src/engine`.
- ESI calls always send `X-Compatibility-Date` and a descriptive
  `X-User-Agent`; respect `X-Ratelimit-*` and `Retry-After`.
- Refresh tokens live in Dexie only. Never send them to Firebase or logs.
- Validate before commit: `npm run lint && npm run typecheck && npm run test:run`.
- i18n: all UI strings through i18next (`src/i18n/locales/en.json`). English only for now.
