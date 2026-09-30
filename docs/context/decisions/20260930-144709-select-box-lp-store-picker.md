# Scope decisions — select-box LP store picker

_Recorded 2026-09-30._

- **The LP store picker is a select-style button opening a popover, not an always-visible combobox.** The LP Store page already has an offers search, so a second search box read as a duplicate. The button shows the open store (or a prompt); the popover pins a search field above the full list. Focus moves to the search field on open and back to the button on Escape. This reshapes decision 20260905-114550 (input keeps focus) for this one picker; it is still hand-built ARIA, no Radix. Wallet's Loyalty Points card uses the same control in its title bar instead of a "Browse LP Stores" link.
