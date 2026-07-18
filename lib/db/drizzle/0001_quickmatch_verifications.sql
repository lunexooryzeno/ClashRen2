CREATE TABLE IF NOT EXISTS "quickmatch_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"ff_uid" text,
	"pre_snapshot_at" timestamp,
	"pre_snapshot_data" text,
	"post_snapshot_at" timestamp,
	"post_snapshot_data" text,
	"stat_diff" text,
	"outcome" text,
	"reward_granted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_qm_verif_match_user" UNIQUE("match_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "quickmatch_verifications" ADD CONSTRAINT "quickmatch_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
