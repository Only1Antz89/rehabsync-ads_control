-- M4: tool settings (UTM defaults, approval workflow, timezone), post approval columns and the
-- video fields used by the TikTok/YouTube pipeline. All idempotent; RLS on the new table.

CREATE TABLE IF NOT EXISTS "ads_settings" (
  "id" smallint PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "require_approval" boolean DEFAULT false NOT NULL,
  "utm_source" varchar(80) DEFAULT '' NOT NULL,
  "utm_medium" varchar(80) DEFAULT '' NOT NULL,
  "utm_campaign" varchar(80) DEFAULT '' NOT NULL,
  "timezone" varchar(60) DEFAULT 'Europe/London' NOT NULL,
  "updated_by" varchar(255),
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "ads_settings" ENABLE ROW LEVEL SECURITY;
INSERT INTO "ads_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "ads_posts" ADD COLUMN IF NOT EXISTS "approval_status" varchar(20) DEFAULT 'approved' NOT NULL;
ALTER TABLE "ads_posts" ADD COLUMN IF NOT EXISTS "approval_note" text;
ALTER TABLE "ads_posts" ADD COLUMN IF NOT EXISTS "approved_by" varchar(255);
ALTER TABLE "ads_posts" ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
ALTER TABLE "ads_posts" ADD COLUMN IF NOT EXISTS "video_url" text;
ALTER TABLE "ads_posts" ADD COLUMN IF NOT EXISTS "title" varchar(100);
CREATE INDEX IF NOT EXISTS "ads_posts_approval_idx" ON "ads_posts" ("approval_status");
