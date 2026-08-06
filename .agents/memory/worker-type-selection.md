---
name: Worker Type Selection
description: How the system distinguishes room-creator vs verifier phone workers.
---

# Worker Type Selection

## Rule
`quickmatch_workers.worker_type` determines the phone's role:
- `"room_creator"` (default) — creates game rooms; selected by `selectWorker(modeId)` in `worker-tokens.ts`
- `"verifier"` — runs screenshot OCR; selected by `selectVerifier()` in `quickmatch-verifier.ts`

`selectWorker()` now filters by `workerType = "room_creator"` so verifier phones are never accidentally dispatched for room creation.

**Why:** Before this task, all active workers were treated as room-creators. Adding a verifier type without the filter would break room creation dispatch.

## How to apply
- When registering a verifier phone via `POST /api/admin/workers`, pass `workerType: "verifier"`.
- The admin PATCH endpoint also accepts `workerType` to change an existing worker's role.
- Verifier watchdog: 60 seconds. Room-creator watchdog: 90 seconds (WORKER_WATCHDOG_MS in quickmatch-workers.ts).
