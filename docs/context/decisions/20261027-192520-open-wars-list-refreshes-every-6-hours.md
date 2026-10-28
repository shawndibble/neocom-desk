# Scope decisions — Open-wars list refreshes every 6 hours

_Recorded 2026-10-27._

- **The `public-data-active-wars.yml` job runs every 6 hours (was 12), and the app hides the list after 24 hours (was 48).** A war has a 24-hour wait before it starts, so a 6-hour sweep shows a declaration sooner for pilots with Alerts off; runner minutes are free on this public repo. 24 hours is still four missed runs. Supersedes the 12-hour cadence and 48-hour limit of the 2026-10-21 decisions.
