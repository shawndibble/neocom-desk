# Scope decisions — New pilots see the full rail (issue #6017)

_Recorded 2026-11-07 · issue #6017._

- **A new pilot sees every page on the rail; the hidden list defaults to `[]`.** The pilot hides pages they don't play with Customize. The short eight-page default is gone: the first-run rail question that wrote it was removed (#3324) and its successor on the Overview builds widgets, not the rail (#3585); and with the "N more pages" row removed (decision `20261023-143805-rail-drops-the-n-more-pages-row-sheet`), a short default would leave hidden pages findable only through Customize. Rules out bringing back a short default rail or a first-run rail question.
- **`sync.navSetupAnswered` is retired.** Nothing wrote it once the question went. It leaves the synced-settings allow-list; a copy already in Firestore is still pulled as a stray `sync.` row that nothing reads (the pull filters by prefix only), so removing it never errors or deletes data.
- **Supersedes** the default-set bullets in `20261009-163837-pinned-rail-alerts-bell-pilot-lookup-back-under` and `20261009-230259-rail-short-default-set-ships-as-a-flat`.
