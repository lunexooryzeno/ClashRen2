---
name: Composed match assignments
description: How generated team and slot assignments are shared with player-facing pages.
---

Composed match generation stores the visible team/match number and member position in the existing tournament participant assignment fields, while the composed-match table remains the roster source for team sides and formats.

**Why:** The existing participant fields are already returned by tournament and match APIs, so this supports Solo/None and team formats without a schema migration or requiring a room match record.

**How to apply:** When changing composed-match generation or player assignment displays, keep participant assignment updates and the player API response synchronized with the composed roster.