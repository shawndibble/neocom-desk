# Scope decisions — Login page is areas by job, away, tour, trust: the Overview demo and question grid are retired

_Recorded 2026-11-26._

_Supersedes the Overview-first section order and the question-tile grid of 20261125-013219-login-page-is-a-tactical-hud-split-hero.md. The hero, the HUD style and the phone login bar stand._

- **The hero sells the whole app, not market search.** The headline already did; the tagline now lists skills and fits, industry and PI, orders and contracts, corp tax and mail, and alerts while the game is closed. The reticle gains two read-outs (industry, PI and corp; alerts) so its four boxes span the app. A strip of five true facts sits under it.
- **One Areas explorer replaces the Overview demo, the question grid and the feature tabs.** Five tabs by job (Trade, Build, Fly, Run a corp, Stay in touch), each a real capture, three questions it answers, its pages and its walkthrough videos. The three old sections overlapped, and the owner approved the mock that dropped the interactive Overview demo, so `OverviewDemo` and its data are deleted (git history keeps them) along with the eight captures nothing uses now.
- **Alerts get their own section, "Away".** The bell's sample alerts, the three phone captures and the alerts walkthrough, because alerts while the game is closed and the phone layout are what a desk beside the client adds.
- **Videos are placed by area and labelled by outcome.** Each walkthrough sits on the area it explains under a short custom label ("Watch an industry build, start to sale"); the full YouTube title is the dialog and player title. The Tour section keeps the 1:38 promo, the full evening tour and a link to the channel. The button's accessible name is its visible label.
- **Trust moves up beside the tour and is four cards:** Reads, Writes (every write listed in full), Stays and Costs. The permissions accordion stays. The offline card is dropped, since the strip says it.
- **Community and FAQ stay two sections** so each keeps its nav anchor.
