# Scope decisions — Jump fatigue is hull-driven, not skill-driven (issue #2862)

_Recorded 2026-10-08 · issue #2862._

- **`jumpFatigue` takes a hull `distanceFactor`, not a Jump Drive Operation level.** CCP's Phoebe dev blog and the EVE University wiki show no skill changes fatigue or the reactivation timer; Jump Drive Operation only cuts capacitor cost. Only the hull does, by shortening the distance counted (Black Ops 0.25; freighters, haulers, DSTs, capsules 0.1). The ticket's skill input is therefore dropped; the follow-up route ticket supplies the factor per hull. Caps (5 h fatigue, 30 min cooldown) are the wiki's.
