# Scope decisions — Price alerts can be set from any item; the Quickbar stays the one store (issue #1427)

_Recorded 2026-09-24 · issue #1427._

- **One write pins and sets the target.** The Market Browser header bell and the item context menu's "Set price alert…" call `pinWithTarget`, a single Quickbar write — `add` then `setTarget` would lose the pin. No second alert store; the alert still lives on the Quickbar item.
- **The alert compares against the Default Trade Hub, and the form says so.** `priceAlertDomain` prices at the synced Settings hub, which can differ from the Market Browser's device-local hub. The form names the hub and shows its current lowest sell as a reference, never a pre-fill. Per-hub alerts remain out of scope.
- **Clear keeps the pin.** Clearing an alert from the header or menu removes only the target.
