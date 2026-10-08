# Scope decisions — Alpha clone injectors clamp to the 20M SP cap (issue #2909)

_Recorded 2026-10-08 · issue #2909._

- **On an Alpha clone the Skill injectors panel clamps the SP to cover to the headroom below 20,000,000 SP (`ALPHA_SP_CAP`), not a cap note beside unchanged figures.** Headroom counts unallocated SP (total + unallocated). Injector count, surplus and price follow the clamped gap, and one line reports the shortfall. Omega and an unset Clone State are unchanged. No new control, so no mockup. The 5M free-training figure is not modelled: injectors work past it. CCP's current Alpha figures were not re-checked from this environment (no web access); verify before relying on them.
