# net-worth-chart

Issue #2865.

Final design of the Wallet net worth chart. Replaces the Wallet balance chart. No Overview card (an earlier version had one; ignore it).

- Wallet history is backfilled from the journal; the other layers (assets, PLEX, order escrow) start at the first snapshot day.
- History syncs via Firestore. Layer and Character toggles are device-local.
- Still to confirm: colors, the sell-order stock layer, PLEX Vault.

- `today-desktop.png`, `today-phone.png`: Today, real screenshots (baseline).
- `a-single-desktop.png`, `a-single-phone.png`: A, single Character.
- `b-multiple-desktop.png`, `b-multiple-phone.png`, `b-multiple-funnel-sheet-phone.png`: B, multiple Characters, plus the phone funnel sheet.
- `c-drilled-desktop.png`, `c-drilled-phone.png`: C, drilled into one Character.
- `d-assets-landing-desktop.png`, `d-orders-landing-desktop.png`, `d-journal-landing-desktop.png`: D, drill-down landing pages, desktop.
- `d-assets-landing-phone.png`, `d-orders-landing-phone.png`, `d-journal-landing-phone.png`: D, landing pages, phone.
- `e-first-day-desktop.png`, `e-first-day-phone.png`: E, first day (1 snapshot).
- `e-second-day-desktop.png`, `e-second-day-phone.png`: E, second day (2 snapshots).
- `f-gaps-desktop.png`, `f-gaps-phone.png`: F, gaps (days the app was not opened).
- `g-new-device-syncing-desktop.png`, `g-new-device-syncing-phone.png`: G, new device, history syncing.
- `h-forms-desktop.png`, `h-forms-phone.png`: H, scope readout and sync forms.
- `notes.png`: Notes board (layers, history rules, sync, controls, open questions).

First draft mockup; sample data. The ticket's Agent Brief text wins over the picture where they differ.
