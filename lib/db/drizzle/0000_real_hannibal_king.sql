ALTER TABLE "slot_matches" ADD COLUMN "room_direct_link" text;--> statement-breakpoint
ALTER TABLE "slot_matches" ADD COLUMN "credential_share_mode" text NOT NULL DEFAULT 'both';
