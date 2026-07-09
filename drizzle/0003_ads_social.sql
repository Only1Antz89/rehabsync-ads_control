-- M1 social publishing: connected accounts, posts, per-platform targets, and metric snapshots
-- (metrics tables ship now so M2 analytics is code-only). OAuth tokens are AES-256-GCM encrypted
-- by the app before storage — never plaintext in the database.

CREATE TABLE IF NOT EXISTS "ads_social_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform" varchar(20) NOT NULL,
  "external_id" varchar(120) NOT NULL,
  "display_name" varchar(200) NOT NULL,
  "avatar_url" text,
  "access_token_enc" text,
  "refresh_token_enc" text,
  "token_expires_at" timestamp,
  "scopes" text,
  "status" varchar(20) DEFAULT 'connected' NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "connected_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ads_social_accounts_platform_ext_idx" ON "ads_social_accounts" USING btree ("platform", "external_id");

CREATE TABLE IF NOT EXISTS "ads_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "link_url" text,
  "image_url" text,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamp,
  "published_at" timestamp,
  "created_by" varchar(255),
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_posts_status_sched_idx" ON "ads_posts" USING btree ("status", "scheduled_at");

CREATE TABLE IF NOT EXISTS "ads_post_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "ads_posts"("id") ON DELETE cascade,
  -- Null account = a manual-export target for a platform with no connected account.
  "account_id" uuid REFERENCES "ads_social_accounts"("id") ON DELETE cascade,
  "platform" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "platform_post_id" varchar(160),
  "platform_url" text,
  "error" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_post_targets_post_idx" ON "ads_post_targets" USING btree ("post_id");
CREATE INDEX IF NOT EXISTS "ads_post_targets_status_idx" ON "ads_post_targets" USING btree ("status");

CREATE TABLE IF NOT EXISTS "ads_post_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "target_id" uuid NOT NULL REFERENCES "ads_post_targets"("id") ON DELETE cascade,
  "captured_at" timestamp DEFAULT now() NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "reach" integer DEFAULT 0 NOT NULL,
  "likes" integer DEFAULT 0 NOT NULL,
  "comments" integer DEFAULT 0 NOT NULL,
  "shares" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "video_views" integer DEFAULT 0 NOT NULL,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_post_metrics_target_idx" ON "ads_post_metrics" USING btree ("target_id", "captured_at");

CREATE TABLE IF NOT EXISTS "ads_account_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "ads_social_accounts"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "followers" integer DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "reach" integer DEFAULT 0 NOT NULL,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ads_account_metrics_account_date_idx" ON "ads_account_metrics" USING btree ("account_id", "date");

ALTER TABLE "ads_social_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ads_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ads_post_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ads_post_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ads_account_metrics" ENABLE ROW LEVEL SECURITY;
