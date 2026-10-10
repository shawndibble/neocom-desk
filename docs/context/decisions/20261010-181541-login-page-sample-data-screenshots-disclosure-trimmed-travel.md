# Scope decisions — Login page: sample-data screenshots, disclosure trimmed, Travel added

_Recorded 2026-10-10._

- **<Decision>.** <Why, and what it rules out.>

Supersedes the "real captures" and disclosure points of
`20260924-165646-login-page-drops-the-read-only-claim-and.md`.

- **The gallery is sample data, not a real pilot.** The captures were taken
  from a fictional pilot ("Aurelia Vex") with mocked ESI data through a
  throwaway Playwright spec, so the page no longer says "real screens from a
  real pilot". A desktop Overview capture now leads the gallery (10 images).
- **The write-exceptions paragraph is gone.** It repeated the "Five writes"
  trust card. The read-scope sentence stays (a test pins it to the Base Grant)
  minus its two trailing sentences, which the customize link and the app
  itself already cover; a privacy-policy link follows it.
- **`public/privacy.html` was stale** (three writes) and now names all five.
- **The "Installable PWA" footer label is dropped** — it was text, not a link.
- **Catalog follows the nav:** Travel added; Wallet no longer claims the LP
  store (it is a Market tab); Market names it; Mining mentions Survey; Assets
  mentions Move; "Market Orders" is "Open Orders".
- The hero preview uses the capture's figures (next industry job as the
  deadline, not a colony reset, since PI is being overhauled).
