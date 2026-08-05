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
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_access_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "match_id" text NOT NULL,
  "worker_id" integer NOT NULL,
  "issued_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "completed" boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_response_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "token_id" integer,
  "match_id" text NOT NULL,
  "worker_id" integer,
  "phone_status" text,
  "msg_code" text,
  "response_code" text,
  "payload" text,
  "received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quickmatch_verifications" ADD COLUMN IF NOT EXISTS "notified_at" timestamp;
