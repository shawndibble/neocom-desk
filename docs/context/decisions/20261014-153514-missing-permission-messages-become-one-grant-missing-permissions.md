# Scope decisions — Missing-permission messages become one Grant missing Permissions link

_Recorded 2026-10-14._

- **A passive "this Character hasn't granted X" message is replaced by one
  text link, "Grant missing Permissions".** It goes to Settings › Permissions
  with `?grant=<groups>`, and that page flashes the Grant button of each
  flagged Permission, so the reader can also grant anything else there. Text
  size, not a Button, no 44px target.

- **Banners that already carry their own Grant button keep it** (Grant
  Character details, Log in again, the corp prompt): one press there starts
  the login, which the link would turn into two steps.
