-- Incremental migration: schema additions accumulated since 0001.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so this file
-- is safe to run on any database state (fresh or already partially migrated).

-- ── New tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "composed_slot_matches" (
  "id" serial PRIMARY KEY NOT NULL,
  "slot_id" integer NOT NULL REFERENCES "tournaments"("id") ON DELETE cascade,
  "slot_index" integer NOT NULL DEFAULT 0,
  "match_type" text NOT NULL DEFAULT '1v1',
  "row_order" integer NOT NULL DEFAULT 0,
  "team_a_player_ids" jsonb NOT NULL,
  "team_b_player_ids" jsonb NOT NULL,
  "scheduled_time" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "slot_match_verifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "slot_match_id" integer NOT NULL REFERENCES "slot_matches"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "ff_uid" text,
  "pre_snapshot_at" timestamp,
  "pre_snapshot_data" text,
  "post_snapshot_at" timestamp,
  "post_snapshot_data" text,
  "stat_diff" text,
  "is_winner" boolean,
  "reward_granted" boolean NOT NULL DEFAULT false,
  CONSTRAINT "uniq_verif_match_player" UNIQUE("slot_match_id","user_id")
);

CREATE TABLE IF NOT EXISTS "freefire_api_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL DEFAULT '',
  "is_active" boolean NOT NULL DEFAULT true,
  "request_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_used_at" timestamp,
  CONSTRAINT "freefire_api_keys_key_unique" UNIQUE("key")
);

CREATE TABLE IF NOT EXISTS "payment_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "base_amount" numeric(10, 2) NOT NULL,
  "final_amount" numeric(10, 2) NOT NULL,
  "diamonds" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "topup_request_id" integer REFERENCES "topup_requests"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "quickmatch_verifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "match_id" text NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "ff_uid" text,
  "pre_snapshot_at" timestamp,
  "pre_snapshot_data" text,
  "post_snapshot_at" timestamp,
  "post_snapshot_data" text,
  "stat_diff" text,
  "outcome" text,
  "reward_granted" boolean NOT NULL DEFAULT false,
  "notified_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uq_qm_verif_match_user" UNIQUE("match_id","user_id")
);

CREATE TABLE IF NOT EXISTS "media_uploads" (
  "id" text PRIMARY KEY NOT NULL,
  "mime_type" text NOT NULL,
  "data" bytea NOT NULL,
  "temp" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "quickmatch_workers" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "webhook_url" text NOT NULL,
  "webhook_secret" text NOT NULL,
  "supported_game_modes" text NOT NULL DEFAULT 'duel,healing,knife',
  "status" text NOT NULL DEFAULT 'active',
  "priority" integer NOT NULL DEFAULT 0,
  "last_heartbeat_at" timestamp,
  "current_job_match_id" text,
  "worker_type" text NOT NULL DEFAULT 'room_creator',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "quickmatches" (
  "id" text PRIMARY KEY NOT NULL,
  "game_type" text NOT NULL,
  "mode_id" text NOT NULL,
  "player_ids" text NOT NULL,
  "entry_fee" integer NOT NULL DEFAULT 0,
  "prize_amount" integer NOT NULL DEFAULT 0,
  "current_state" text NOT NULL DEFAULT 'QUEUEING',
  "worker_id" integer,
  "join_confirmed_a" boolean NOT NULL DEFAULT false,
  "join_confirmed_b" boolean NOT NULL DEFAULT false,
  "room_id" text,
  "room_password" text,
  "cancel_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "worker_access_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "match_id" text NOT NULL,
  "worker_id" integer NOT NULL,
  "issued_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "completed" boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "worker_response_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "token_id" integer,
  "match_id" text NOT NULL,
  "worker_id" integer,
  "phone_status" text,
  "msg_code" text,
  "response_code" text,
  "payload" text,
  "received_at" timestamp NOT NULL DEFAULT now()
);

-- Task 15: prize state machine
CREATE TABLE IF NOT EXISTS "quickmatch_prizes" (
  "id" serial PRIMARY KEY NOT NULL,
  "match_id" text NOT NULL UNIQUE,
  "payout_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "winner_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "prize_amount" integer NOT NULL DEFAULT 0,
  "state" text NOT NULL DEFAULT 'NOT_CREATED',
  "state_changed_at" timestamp NOT NULL DEFAULT now(),
  "screenshot_media_id" text,
  "ocr_result" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ── New columns on existing tables ──────────────────────────────────────────

-- users: auth providers + profile fields
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_profile_complete" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quickmatch_banned_until" timestamp;

-- slot_matches: verification + game mode fields
ALTER TABLE "slot_matches" ADD COLUMN IF NOT EXISTS "verification_status" text NOT NULL DEFAULT 'pending';
ALTER TABLE "slot_matches" ADD COLUMN IF NOT EXISTS "game_mode" text;
ALTER TABLE "slot_matches" ADD COLUMN IF NOT EXISTS "match_mode" text;
ALTER TABLE "slot_matches" ADD COLUMN IF NOT EXISTS "prize_amount_diamonds" integer NOT NULL DEFAULT 0;
ALTER TABLE "slot_matches" ADD COLUMN IF NOT EXISTS "reward_distributed_at" timestamp;

-- wallet_transactions: pending prize support (Task 15)
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'settled';
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "payout_id" text;

-- media_uploads: temp screenshot support (Task 15)
ALTER TABLE "media_uploads" ADD COLUMN IF NOT EXISTS "temp" boolean NOT NULL DEFAULT false;
ALTER TABLE "media_uploads" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;

-- quickmatch_workers: verifier type support (Task 15)
ALTER TABLE "quickmatch_workers" ADD COLUMN IF NOT EXISTS "worker_type" text NOT NULL DEFAULT 'room_creator';

-- quickmatch_verifications: notification tracking
ALTER TABLE "quickmatch_verifications" ADD COLUMN IF NOT EXISTS "notified_at" timestamp;

-- ── Unique constraints (idempotent via DO block) ─────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_google_id_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
  END IF;
END $$;
