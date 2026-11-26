# Scope decisions — Landing page sections share the header's max-w-page edges

_Recorded 2026-11-26._

- **The login page's header, hero and every `LandingSection` use `mx-auto max-w-page px-4 sm:px-6`**, so the left and right edges line up all the way down. They had drifted to three widths: the header at 96rem, the hero at 96rem with `lg:px-16` of extra padding, and sections at `max-w-6xl`. The owner liked the header's width and asked for the rest to match it.
- **The closing "Ready to undock" call to action stays `max-w-6xl`.** It is only centered text, so it has no left edge to line up with.
