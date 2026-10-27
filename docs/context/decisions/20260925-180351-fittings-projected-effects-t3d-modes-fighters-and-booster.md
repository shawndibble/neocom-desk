# Scope decisions — Fittings: projected effects, T3D modes, fighters and booster side effects are in scope

_Recorded 2026-09-25._

- **Fleet boosts, command bursts and other projected effects are now in scope.** This supersedes "Fleet boosts and command bursts are out of v1" in `20260924-150509-fittings-section-a-fitter-after-all.md`. A Fitting's stats can be worked out with another saved Fitting's outgoing effects (its bursts, remote reps, webs, neutralizers…) projected onto it, through the engine's own `incoming`, beside any Abyssal weather. Like the weather, it is a question asked of a fit, not part of it: not saved, not in a Share Link.
- **Tactical Destroyer modes, fighters and booster side effects are in scope.** A mode and the chosen booster side effects are part of the Fitting and ride its Share Link in trailing sections, so every link made before still opens unchanged. Fighters use the Share Link's existing fighter section, which the app used to drop.
- **Still out: Abyssal (mutated) modules and structures / citadels.** Both stand as `20260924-150509` left them; the Abyssal weather picker (`20260925-125539`) is unaffected.

## Not carried

- **EFT, DNA, XML and In-game Fittings carry neither a Tactical Destroyer mode nor booster side effects; only the Share Link does.** Pyfa's EFT port (`service/port/eft.py`) was checked: its export writes no mode or side-effect line, and its import reads none. No verified form for either is known for DNA, XML or ESI, so those were left as they are rather than given an invented line. A Fitting loaded from any of them opens on the hull's default mode with no side effects switched on.
