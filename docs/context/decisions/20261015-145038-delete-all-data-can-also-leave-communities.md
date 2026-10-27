# Scope decisions — Delete all data can also leave Communities (issue #3849)

_Recorded 2026-10-15 · issue #3849._

- **Delete all data offers "Also leave my Communities", ticked by default.** The person already chose to erase everything; unticking keeps the old behaviour. The leave runs before the remote purge, while each Character can still sign in.
- **A Community the Character administers is skipped and named, never deleted or handed over automatically.** The server refuses an admin's leave (`admin-cannot-leave`), and deleting a Community affects every Member.
- **A failed leave is reported like an unpurged Character and never stops the local erase.** The dialog stays open on "Finish deleting".
- **A Community lookup that fails (offline, expired login) hides the question rather than blocking the wipe.** The Character's Communities then wait for the 90-day inactivity removal.
