# Scope decisions — Fittings: Load reads an EVE Workbench fit link (issue #2483)

_Recorded 2026-10-03 · issue #2483._

- **Load reads an EVE Workbench fit link** (`eveworkbench.com/fit/<id>[/<slug>]`), replacing the refusal that told the pilot to copy the EFT across by hand. The browser fetches the published fit's EFT from Workbench's public API (`GET api.eveworkbench.com/v1/fits/{id}/eft`, no key, CORS echoes the Origin) and hands it to the same EFT path as a paste, so its unknown-item and too-many-slots warnings carry over. They name the item rather than a line number, since the pilot never saw that text. No backend and no API key; export to Workbench is still EFT only (`20260924-150509`).
- **A link Workbench won't serve says which failure it was, as far as Workbench tells.** "No published fit at that link" covers a deleted, missing, private or malformed id; Workbench's API answers all of them the same way (HTTP 200, `Error: true`), so they aren't told apart. "Couldn't be reached" covers a network failure, a server error, or a reply that isn't a fit. A Workbench fit link is never reported as unrecognised.
