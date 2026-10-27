# Scope decisions — Share Links use a short /s/ key

_Recorded 2026-10-09._

- **A stored Share Link is `/s/<key>`, a 6-character key from a 31-letter lowercase alphabet with no `0/o/1/l/i`.** It reads aloud and survives a screenshot; ~30 bits is enough because `shares` is get-by-id only. It replaces the 9-character mixed-case `/share/<id>`.
- **`/share/<id>` keeps opening, and the rules and `isShareId` still accept 9-character ids.** Links already sent live up to a week; nothing is migrated. The permanent `/share/fitting?f=<code>` URL is a different thing (the fitting is in the URL) and is unchanged.
