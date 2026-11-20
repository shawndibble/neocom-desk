# Scope decisions — Expired Extractions leave the timeline after 2 days and move to a paged Past list

_Recorded 2026-11-19._

Refines 20261111-221027 (the Extractions tab keeps past chunks): Expired stays on by default, but history older than 2 days sits under Past Extractions instead of beside the coming ones.

- **An Extraction is history once it expired more than 2 days ago, or was cancelled.** The Moons › Extractions timeline drops it and the table below no longer lists it, so neither grows without end. Nothing is deleted: the moon page, the book's figures and the Tax tab still count it.
- **History is one collapsed-on-phone "Past Extractions" section under the table,** newest expiry first, ten rows then "Load older" (DESIGN.md "Load more", the `BookSection` shape). The state chips still narrow it. The timeline's axis now starts 2 days back instead of 20.
