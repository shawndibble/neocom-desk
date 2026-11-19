# Scope decisions — Vetting settings: a gear and a modal, not a tab

_Recorded 2026-11-18._

- **Vetting's settings open from a gear in the page header, in a modal over the queue.** Every other page puts its own settings behind a gear (`pageSettings.open`); a Settings tab beside Open and Decided was the one page that didn't, so a Director looked for the gear and didn't find it. Only a Director sees the gear, as only a Director saw the tab.
- **The modal keeps its URL: `/corp/vetting/settings/<section>`.** Sections stay linkable and bookmarkable, and Back closes the modal, so it is `closeOnBack={false}`. `settings` stays in `VETTING_TABS` as a `standalone` tab, which the bar and the phone's segmented control leave out. Closing goes to Open.
- **It is not `PageSettingsModal`.** That wraps a form Settings also renders, with an "All settings" link back to it. Vetting's settings are a corporation's, saved to the server, and have no section in app Settings, so there is no second copy to link to.
- **A click outside does not close it.** The form holds an unsaved draft; Escape and the close button still do, and drop the draft as leaving the old tab did.
- **The watchlist's name field suggests as you type.** It is the Payee name field (`PayeeNameField`): the signed-in character's ESI search, or exact-name and zKillboard matches without the search permission. A pick only fills the name; the server still resolves the typed name exactly, so the callable is unchanged.
