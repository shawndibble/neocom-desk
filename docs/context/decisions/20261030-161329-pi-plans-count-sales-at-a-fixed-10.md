# Scope decisions — PI plans count sales at a fixed 10% share of the hub region's daily volume (issue #5642)

_Recorded 2026-10-30 · issue #5642._

- **PI plans (Goal Plan, whole-account plan) count a P2+ product's hub sales at no more than 10% of the hub region's daily volume.** Units over it count as unsold: no revenue, no sales tax; customs still paid. The share is Industry's default (`DEFAULT_SALES_SHARE_PCT`), fixed, not a setting. Unknown volume means no cap and no flag, never zero. Rules out a user-editable PI share and capping surplus P1.
- **The whole-account plan ranks candidates by price × units the hub absorbs (up to a per-tier reference output), not price alone.** A thin high-price P4 no longer outranks a liquid one. This may change today's account-plan picks; the owner confirmed.
- **Only rows over the share show a flag**, as a second line of text (not a tooltip): "Plan sells N/day · <region> trades M/day (x%) · counted at C/day".
