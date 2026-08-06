---
name: Prize State Machine
description: How quickmatch prize payouts work — idempotent state machine, table design, and the only allowed mutation path.
---

# Prize State Machine

## Rule
All prize state mutations MUST go through `artifacts/api-server/src/lib/prize-state.ts`. No other code may write to `quickmatch_prizes` or `wallet_transactions.status`.

## State path
`NOT_CREATED → PENDING → LOCKED → FINALIZED | REVERSED`

Every UPDATE uses `WHERE state = <expected_previous_state>`. If 0 rows are updated, the call is a no-op (race guard).

**Why:** Idempotency — retries, crashes, and duplicate callbacks must never double-credit a prize.

## Key facts
- `quickmatch_prizes` row is seeded with `NOT_CREATED` at match creation (in quickmatch.ts join handler).
- `pendingPrize()` does NOT add to `diamond_balance`; it inserts a `wallet_transactions` row with `status="pending"`.
- `finalizePrize()` does: LOCKED→FINALIZED + increments `diamond_balance` + marks transaction `status="settled"`.
- `reversePrize()` does: LOCKED→REVERSED + deletes the pending transaction row.
- `payout_id` on `quickmatch_prizes` is the idempotency key; also stored on `wallet_transactions.payout_id`.

## How to apply
- Dispute resolution (Task 16) calls `finalizePrize` or `reversePrize` — nothing else.
- Never call `db.update(quickmatchPrizesTable)` outside prize-state.ts.
