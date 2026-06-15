CREATE TABLE IF NOT EXISTS "payment_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"base_rupees" integer NOT NULL,
	"offset_paise" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"topup_request_id" integer,
	"bharatpe_txn_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_sessions_bharatpe_txn_id_unique" UNIQUE("bharatpe_txn_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_topup_request_id_topup_requests_id_fk" FOREIGN KEY ("topup_request_id") REFERENCES "public"."topup_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ps_user" ON "payment_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ps_status" ON "payment_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ps_base_status" ON "payment_sessions" USING btree ("base_rupees","status");
