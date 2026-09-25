# Scope decisions — Missing standings scope now shows a dismissible re-login notice (issue #1238)

_Recorded 2026-09-24 · issue #1238._

- **A Character whose grant lacks `esi-characters.read_standings.v1` now gets
  a dismissible shell notice with a re-login button**, reversing the "degrades
  silently" call in `20260922-200200-broker-fees-use-verified-npc-station-standings-base.md`.
  That record judged a slightly higher broker fee not worth interrupting
  sessions, but it left every pre-scope login on "assume 0 standing" with
  nothing telling the user a re-login would fix it, and the figures are wrong
  for anyone with real standings.
- **The notice is driven by the stored grant, not a live 401/403.**
  `esi/cache.ts`'s `isWorthReportingToShell` (#1521) intentionally never
  emits the shell failure for a scope the grant did not claim, so
  `AuthFailureNotice` cannot fire here. `StandingsScopeNotice` reads
  `useEndpointsGranted(['getCharacterStandings'])` instead.
- **Dismissal is per Character and persisted** (`localStorage`), so it is a
  one-time nudge. The Appraisal panel's inline note is unchanged.
- **`loadCharacterStandings` no longer calls ESI when the stored token lacks
  the scope**; it returns `[]` as before. A missing token row still fetches.
  `detectAuthFailure` stays `() => false`: the fallback itself is unchanged.
