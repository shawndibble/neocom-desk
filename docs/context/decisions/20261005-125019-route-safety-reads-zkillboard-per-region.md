# Scope decisions — Route Safety reads zKillboard per region

_Recorded 2026-10-05. Supersedes the first bullet of `20260930-002219`._

- **zKillboard is read one region per request, not one system.** Probed
  2026-10-05: `kills/systemID/A,B/` now answers "multiple values separated by
  commas are no longer supported", but `kills/regionID/{id}/pastSeconds/3600/`
  works and covers every system in the region (~0.5s, 9–37 kills in five busy
  regions). A route crosses far fewer regions than systems. Concurrency 3 and
  the five-minute cache are unchanged; the cache is now per region.
- **A full page is never taken as the whole answer.** zKillboard returns at
  most 1,000 kills per page, so a page of 1,000 makes the client read
  `/page/2/`, `/page/3/`… until one comes back short. Any page failing, an
  error body, or still being full at the 10-page backstop fails the whole
  region: a partial hour would read as quiet. A kill that shifts onto two
  pages is counted once.
- **A system with no known region still asks by `systemID`.** That is only
  when the solar-system snapshot cannot be read.
