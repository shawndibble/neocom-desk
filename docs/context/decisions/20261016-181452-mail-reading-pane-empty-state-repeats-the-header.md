# Scope decisions — Mail reading-pane empty state repeats the header Compose (issue #3972)

_Recorded 2026-10-16 · issue #3972._

- **On a wide screen the empty reading pane offers Compose, even though the header already has it.** An empty pane is the largest area on the page and Compose is the one thing a pilot can do from it, so §6c's "a header action already gives it, add nothing" gives way here. Both buttons call the same handler. Rules out repeating it anywhere the pane isn't on screen: a phone (the list is the whole screen and Compose floats) and the inline composer itself. The empty-folder list state still adds no Compose: that one is a list state, not the page's resting state.
