# Scope decisions — Remove the what's new modal

_Recorded 2026-09-12._

- **The "what's new" post-update modal is removed; the app ships no in-app
  release notes.** It was feature-parity item 11, built to the brief in
  `docs/plans/feature-parity/briefs/J-shell-polish.md`. The bundled changelog
  never grew past its single seed entry — every release since shipped without an entry, so the
  modal had nothing to show and the maintenance cost (append an entry per
  release, or the modal silently does nothing) bought nothing. This rules
  out `src/app/WhatsNewPanel.tsx`, `whatsNew.ts`, `changelog.ts`, and
  `lastSeenVersion.ts`. Release notes, if they return, belong in GitHub
  Releases rather than a bundled array.
- **`__APP_VERSION__` stays.** The modal was one consumer, not the only one —
  `src/instrument.ts` tags every Sentry release with it, so `vite.config.ts`'s
  `define` and the `src/vite-env.d.ts` declaration are load-bearing.
- **The orphaned `whatsNew.lastSeenVersion` settings row is left in place on
  existing devices rather than migrated away.** `createLocalSetting` reads by
  exact key, and every full-table settings scan (`sync/planSync.ts`,
  `backup/io.ts`) filters to the `sync.` allowlist, so a plain key never
  leaves the device. A migration would cost a schema version to delete a
  string.
