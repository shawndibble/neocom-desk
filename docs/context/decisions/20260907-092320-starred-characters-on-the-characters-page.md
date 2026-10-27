# Scope decisions — starred characters on the Characters page

_Recorded 2026-09-07._

- **The character switcher's sort key and direction are deliberately not
  persisted.** A settings audit proposed adding them to the device-local
  settings; it was declined. What the user actually wanted from "my list keeps
  coming back in the wrong order" was not a remembered sort but a way to keep
  the few Characters they fly at the top of it — so **Starred Character** was
  built instead. Recorded here because the proposal will otherwise look like an
  oversight the next time someone audits the settings keys.
- **A star floats a card inside its own group section; it does not create a
  top-level "Starred" section.** Pulling starred Characters out of their groups
  would put the grouping and the star in charge of the same thing and leave
  `moveCharacterToGroup` describing a placement the wall no longer honours. The
  star raises the card where it already lives.
- **Starring layers on top of the chosen sort, it does not replace it.**
  `partitionStarredFirst` runs over whatever `sortCharacterIds` returned, so
  the sort key and direction still decide the order inside both halves and a
  star moves exactly one card.
- **Device-local, never synced.** Same reasoning as an **Account** grouping and
  the Overview groups it sorts inside: a star is a statement about the roster
  rather than about any one Character, so no Character's sync scope owns it,
  and EVE SSO exposes no account identity to hang it on.
- **Stars are user-created content, not resettable view state.** There is no
  "clear all stars" control and stars are not wired into any preference-reset
  path. The one id that leaves on its own is one whose Character is no longer
  on the device, reconciled against the roster in the route rather than hooked
  onto the remove button — a sold Character leaves via `handleOwnerHashChange`
  and never presses that button.
- **Scoped to the Characters page.** The character switcher in the app shell
  does not read stars yet. Extending it is a separate change, not an omission.
