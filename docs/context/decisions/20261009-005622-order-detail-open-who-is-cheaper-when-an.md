# Scope decisions — Order detail: open Who is cheaper when an undercut exists (issue #3137)

_Recorded 2026-10-09 · issue #3137._

- **"Who is cheaper" opens by default in the Open Orders order-detail modal when a rival is cheaper at any scope.** This narrows the #1428 decision that folded every section by default: the answer to "was I undercut?" should not sit behind a click when there is one. "Clear" and "not checked" stay folded behind their trailing read, as do "Is there a better exit?" and the cost-basis ledger (no cheap "has something to say" signal reused there). The pilot's own toggle wins for the lifetime of the modal open.
