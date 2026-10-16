# Scope decisions — Shortcuts become g sequences with an off switch

_Recorded 2026-10-16._

- **Page shortcuts are `G` then a letter, not a bare letter.** `G O` Overview,
  `G M` Market, `G I` Industry, `G W` Wallet, `G P` Planetary Industry, `G A`
  Alerts, `G T` Mining tax, `G S` Settings (was `,`), `G C` switch character.
  The pending `G` lasts 1.5 s and any other key, a modifier chord, a typing
  target or an open overlay cancels it. `?` (Help › Shortcuts) and `Esc` stay
  single keys; Ctrl/Cmd+K is unchanged. A lone letter, or one spoken by
  speech input, no longer navigates.
- **The "Single-key shortcuts" off switch comes back** (Settings › Display,
  device-local, default on) and turns off the `G` sequences and `?`. Esc and
  the palette chord are not affected. This re-supersedes the always-on part of
  `20261002-165816-shortcuts-move-to-help-always-on-and-lose` (its move to Help
  and the removal of `/` stand). A two-key sequence of characters still falls
  under WCAG 2.1.4 (Character Key Shortcuts), so it is not a substitute for
  the switch: the sequence cuts accidental firing, the switch meets the
  criterion. No remapping.
- **Until the setting has loaded the listener stays off**, so a pilot who
  switched shortcuts off never gets a live key on a cold load.
- **The Chat link paste destination is removed** (it did not work): a pasted
  `showinfo:` link is ignored like any other unrecognised text.
