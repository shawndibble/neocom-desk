# Scope decisions — Target Profiles: our own NPC class figures, global selection, overlay from My Fittings (issue #1546)

_Recorded 2026-09-24 · issue #1546._

- **Built-in Target Profiles are our own round figures.** NPC frigate 35 m / 400 m/s, cruiser 125 m / 200 m/s, battleship 400 m / 100 m/s. Pyfa's target profiles carry sig/speed only for individual Burner NPCs, never a generic class, so there was no upstream number to cite; a pilot who needs a specific target authors a custom profile.
- **The Target Profile selection is global and synced, like the Damage Profile's.** Custom profiles and the selection are two synced settings (`sync.fittingTargetProfiles`, `sync.fittingTargetProfileId`) and stay out of the `?f=` Share Link.
- **Applied DPS assumes a stationary shooter and a fully transversal target.** Turrets use EVE's chance-to-hit with wrecking shots (a certain hit averages ~1.015x raw, as in Pyfa); a mobile drone at least as fast as the target always hits (Pyfa's "auto" mode), a slower one or a sentry tracks from the ship; nothing applies past drone control range. The UI labels it as our own calculation (ADR 0016). No per-weapon split of the graphs in v1.
- **The overlay is one of the active Character's saved Fittings.** Calculated under the same pilot and Damage Profile, with that Fitting's own default implant basis. No Character means no overlay, so the Share Link view has none. Fitting vs Fitting compare beyond the graphs stays #1547's.
