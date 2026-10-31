# Scope decisions — wallet goal name opens its fitting

_Recorded 2026-10-31._

- **On Wallet › Balance, a Goal priced from a Fitting shows its name as an entity link that opens that Fitting in the editor.** The owner asked for it: the goal is "that ship", so the name goes to it. Fitting has no default destination in §6c's Entities table, so this is recorded as an override. The link opens the editor by the Fitting's Share Code (a saved Fitting's own code, an In-game one encoded); it cannot open a saved Fitting by id, so a saved one opens as an unsaved copy under its own name. A goal with a typed amount has no entity, so its name stays plain text; a fitting goal's name is plain until the code resolves. Edit stays a visible button on the row.
