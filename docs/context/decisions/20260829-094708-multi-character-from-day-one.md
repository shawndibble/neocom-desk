# Scope decisions (v1)

_Recorded 2026-08-29._

- Multi-character from day one.
- Corp/alliance: public info + the member's own view only. No director tooling.
- Read-only: no ESI write scopes (no mail send, no calendar respond). One
  scope reads otherwise on the consent screen: `esi-planets.manage_planets.v1`
  (planetary industry) is the only PI scope CCP publishes, and EVE renders it
  as "manage your planetary installations". The app calls two GETs with it and
  issues no writes, so this claim holds at the behaviour level; the wording is
  CCP's, not a widening of ours. Disclosed at login — see the parity plan §5
  decision 2.
- Industry: manufacturing only; model shaped so invention bolts on later.
