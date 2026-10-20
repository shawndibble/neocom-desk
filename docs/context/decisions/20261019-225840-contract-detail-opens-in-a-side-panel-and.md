# Scope decisions — Contract detail opens in a side panel, and links in its description get a button

_Recorded 2026-10-19._

- **Every contract detail (own, public, courier) opens in a right `SlideOver`,
  not a modal.** The Contracts list stays live behind it, so a reader can step
  through contracts without closing and reopening a dialog. BPC Sourcing's
  contract view shares the public one and moves with it.
- **A link in a contract's description gets an "Open <host>" button**, one per
  distinct http(s) URL, opening a new tab. The description is plain text the
  issuer wrote, so the button names the host it leaves for. Only the own
  contract carries a description today: the public and courier snapshots do not
  hand one to the UI.
- **The panel title is the contract type; the issuer's text is a Description row.** The list row labels itself with the description, but a header has to wrap a long or URL-only one. The rows stay as they were.
