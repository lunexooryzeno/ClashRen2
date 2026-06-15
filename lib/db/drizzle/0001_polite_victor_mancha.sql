CREATE TABLE "composed_slot_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_id" integer NOT NULL,
	"slot_index" integer DEFAULT 0 NOT NULL,
	"match_type" text DEFAULT '1v1' NOT NULL,
	"row_order" integer DEFAULT 0 NOT NULL,
	"team_a_player_ids" jsonb NOT NULL,
	"team_b_player_ids" jsonb NOT NULL,
	"scheduled_time" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_match_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_match_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"ff_uid" text,
	"pre_snapshot_at" timestamp,
	"pre_snapshot_data" text,
	"post_snapshot_at" timestamp,
	"post_snapshot_data" text,
	"stat_diff" text,
	"is_winner" boolean,
	"reward_granted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "uniq_verif_match_player" UNIQUE("slot_match_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "topup_sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"base_rupees" integer NOT NULL,
	"actual_paise" integer NOT NULL,
	"diamonds" integer NOT NULL,
	"paisa_offset" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "freefire_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "freefire_api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "slot_matches" ADD COLUMN "verification_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "slot_matches" ADD COLUMN "game_mode" text;--> statement-breakpoint
ALTER TABLE "slot_matches" ADD COLUMN "match_mode" text;--> statement-breakpoint
ALTER TABLE "slot_matches" ADD COLUMN "prize_amount_diamonds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "slot_matches" ADD COLUMN "reward_distributed_at" timestamp;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD COLUMN "actual_paise" integer;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD COLUMN "session_token" text;--> statement-breakpoint
ALTER TABLE "composed_slot_matches" ADD CONSTRAINT "composed_slot_matches_slot_id_tournaments_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_match_verifications" ADD CONSTRAINT "slot_match_verifications_slot_match_id_slot_matches_id_fk" FOREIGN KEY ("slot_match_id") REFERENCES "public"."slot_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_match_verifications" ADD CONSTRAINT "slot_match_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_sessions" ADD CONSTRAINT "topup_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topup_sessions_active_paise_unique" ON "topup_sessions" USING btree ("actual_paise") WHERE status = 'active';