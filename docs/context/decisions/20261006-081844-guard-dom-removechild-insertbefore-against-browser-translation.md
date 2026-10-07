# Scope decisions — Guard DOM removeChild/insertBefore against browser translation

_Recorded 2026-10-06._

- **A global guard skips `removeChild`/`insertBefore` on nodes browser translation moved.** Chrome's Translate swaps text for `<font>` wrappers; React then throws `NotFoundError` and the route falls to its error boundary (5 Sentry events, Android/ja). React has no fix (facebook/react#11538). `src/app/translateGuard.ts` patches both DOM methods to warn and skip instead of throwing.
- **Translation stays allowed.** No `translate="no"` or `notranslate`: players keep browser translation of this English-only app.
- **Known cost:** text a translator replaced may stay stale until the next render, and a genuine bug of the same shape is masked (still logged via `console.warn`).
