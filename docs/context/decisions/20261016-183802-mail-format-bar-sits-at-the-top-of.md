# Scope decisions — Mail format bar sits at the top of the message box on a phone

_Recorded 2026-10-16. Supersedes "the format bar docks above the keyboard" in
`20261016-124635-mail-compose-format-bar-and-eve-markup.md` and the footer
"lifts above the keyboard-docked format bar" in
`20261016-150102-mail-composer-action-layout.md`, and the keyboard-up strip in
`20261016-155019-mail-editor-chrome-one-card-flat-buttons-source.md`._

- **On a phone the format bar is the message box's top strip, always shown, the same as on a wide screen.** The user asked for the bar to stick to the top of the message box after trying it on an Android phone; always shown is our call. The keyboard dock floated mid-screen in Reply/Forward: the reader `Panel` has `backdrop-filter`, which makes it the containing block for a `fixed` bar, so the bar sat against the Panel, not the keyboard. Showing the bar only on focus would also push the box down at the moment of the tap. The bar still scrolls sideways as one row on a phone. Rules out a keyboard-docked bar and the pinned footer's lift above it.
