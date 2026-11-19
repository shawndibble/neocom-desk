# Scope decisions — Show Info Interactions tab

_Recorded 2026-11-19._

- **Show Info for a pilot gets an Interactions tab** (not for your own Characters). The URL carries `infoTab=interactions` beside `info`, so Back from a row's page returns to the tab.
- **One Character picker chooses the source**: This character, All characters, or Corporation. The Corporation option appears for anyone whose corp access is `ready` (any corp role) and shows what that account can already see on the corp pages; there is no extra Director-only gate.
- **Rows open the page that holds the interaction** (whole row is the link; killmails open zKillboard in a new tab). Contract prices are counted once, under Contracts, not again as wallet rows.
- **Killmails list both sides.** Personal: you killed them, they killed you, same side. Corporation: we lost, we killed; "Hostile" means a corp member died with them on the killmail in the last 90 days.
- Limits: wallet journal is what the device has archived; zKillboard covers a pilot's latest 200 kills and losses; mail is cached headers (subject only).
- Row links highlight the row only for the active Character (Wallet keys its multi-Character rows by the active Character, as for alerts); a row of another Character opens the page without the highlight. Contracts links ask for all Characters so the contract is found.
