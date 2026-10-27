# Scope decisions — ScopeGate's sole reauth CTA takes the md control tier at both widths (issue #1135)

_Recorded 2026-09-15 · issue #1135._

- **The reauth CTA `ScopeGate` shows in place of a locked route moves to the
  `md` control tier outright, growing on a pointer as well as on a phone.**
  Issue #1135 asked for the 44px touch target and also for "no change to
  rendering at or above `md` (768px)", on the premise that `md`'s own `md:`
  prefix collapses to the height `sm` already had. It does not: DESIGN.md §3's
  scale is `sm` = `h-9 md:h-7` and `md` = `h-11 md:h-9`, so the pointer height
  goes 28px → 36px (and the padding and type scale go with it). Holding the
  pointer width fixed would need an `h-11 md:h-7` rung that the scale does not
  have and that §3 explicitly forbids hand-writing. 36px is what every other
  primary `<Button>` in the app already renders at on a pointer, so a locked
  route's one action matching them is the outcome to want, not a cost. This
  rules out a bespoke height for this one banner.
- **The tier is an opt-in `soleAction` prop on `ReauthBanner`, not a change to
  its shared default and not a read of `variant`.** `ReauthBanner`'s ~20 other
  call sites are in-page secondary banners that sit beside a view's own
  controls, where the compact tier is right; almost none of them pass `variant`
  either, so they inherit `primary` too and keying the size off it would resize
  every one of them. This rules out both "just make the default `md`" and
  "`primary` means sole action".
