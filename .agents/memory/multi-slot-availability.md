---
name: Multi-slot availability
description: Rules for showing and booking tournaments that contain multiple registration sessions
---

For a tournament with multiple configured sessions, user discovery should remain available until every session has passed its own registration cutoff. A user may select and book any session that is still open, even when an earlier session is already closed.

**Why:** Applying the tournament's first or overall start time to every session hides valid later booking opportunities and makes the slot picker inconsistent with the join API.

**How to apply:** Evaluate cutoff and ended state against each session independently. Keep joined users' history/detail access unchanged, and pass the selected session index through the booking request.