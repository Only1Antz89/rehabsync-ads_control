-- Ads P4: social listening — keyword/mention streams and the public mentions they match,
-- ingested by webhook across the connected (and additional) networks.

CREATE TABLE IF NOT EXISTS "ads_listening_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "ads_listening_queries" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ads_listening_mentions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "query_id" uuid REFERENCES "ads_listening_queries"("id") ON DELETE SET NULL,
  "platform" varchar(20) NOT NULL,
  "external_id" varchar(200) NOT NULL,
  "author_name" varchar(200),
  "author_handle" varchar(200),
  "permalink" varchar(600),
  "content" text NOT NULL,
  "sentiment" varchar(12) DEFAULT 'unknown' NOT NULL,
  "matched_term" varchar(160),
  "status" varchar(12) DEFAULT 'new' NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ads_listening_mentions_platform_ext_idx" ON "ads_listening_mentions" ("platform", "external_id");
CREATE INDEX IF NOT EXISTS "ads_listening_mentions_status_idx" ON "ads_listening_mentions" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "ads_listening_mentions_query_idx" ON "ads_listening_mentions" ("query_id");
ALTER TABLE "ads_listening_mentions" ENABLE ROW LEVEL SECURITY;
