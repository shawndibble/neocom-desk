# Scope decisions — Install Prompt is mobile-only

_Recorded 2026-10-02._

- **The Install Prompt shows on iOS and Android only.** Desktop browsers
  already surface install in their own address-bar UI, so the in-app CTA is
  dropped on desktop Chrome/Edge even though `beforeinstallprompt` fires
  there. (A desktop browser emulating an iPhone UA — devtools device mode —
  is still treated as iOS; UA is all there is to go on.)
- **Instructions are worded per browser family.** iOS Safari points at
  Share, which newer iOS tucks under the ••• Page Menu (Apple's iPhone User
  Guide); other iOS browsers (Chrome, Firefox, Edge — WebKit, no
  `beforeinstallprompt`) at their own menu's Share; Android without a native
  prompt (Firefox, Samsung Internet, …) at the browser's ⋮ menu → Install
  app / Add to Home screen. Android with `beforeinstallprompt` keeps the
  one-tap native Install button.
