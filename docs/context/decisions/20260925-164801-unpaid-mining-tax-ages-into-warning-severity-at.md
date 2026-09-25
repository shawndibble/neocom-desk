# Scope decisions — Unpaid mining tax ages into warning severity at 30 days (issue #1735)

_Recorded 2026-09-25 · issue #1735._

- **Unpaid mining tax is `watch` until its oldest unpaid entry is 30 days old, then `warning`.** A single owed ISK is not urgent; ranking it as a warning from day one buried real deadlines on the phone stack. Approved by Shawn 2026-09-25. Card header words are now per-domain ("Unpaid", "Ready", "Log in again") instead of the generic "Due soon"; severity rank is unchanged by wording.
