-- Ads P2: per-network caption variations + a scheduling queue.

-- Per-target caption override (null = use the post's base body).
ALTER TABLE "ads_post_targets" ADD COLUMN IF NOT EXISTS "body_override" text;

-- Weekly posting slots (UTC). "Add to queue" schedules a post into the next free slot.
CREATE TABLE IF NOT EXISTS "ads_posting_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "weekday" smallint NOT NULL,
  "minutes" integer NOT NULL,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ads_posting_slots_unique_idx" ON "ads_posting_slots" ("weekday", "minutes");
ALTER TABLE "ads_posting_slots" ENABLE ROW LEVEL SECURITY;
