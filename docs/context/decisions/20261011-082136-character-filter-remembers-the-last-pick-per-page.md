# Scope decisions — Character filter remembers the last pick per page (issue #3563)

_Recorded 2026-10-11 · issue #3563._

- **The Character filter is remembered per page, device-local.** Assets, Wallet, Industry Active Jobs, Opportunities, Open Orders and Mining Tax (`20261021-202639`, first visit All characters) each keep their own last This character / All characters pick (`characterFilterPicks`), because All characters is a deliberate, heavier view on Assets and must not carry to the others. Rules out one shared value.
- **Precedence: URL, then the page's pick, then the Settings default.** The Settings default stays synced and only seeds a page with no pick. A link's value is never remembered; only a change to the control is.
- **Opportunities and Open Orders now follow the Settings default on first visit.** Opportunities was hard-coded to This character; Open Orders opened on All characters regardless.
