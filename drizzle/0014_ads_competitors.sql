-- Competitor tracking + share-of-voice: brand term-sets matched against listening mentions.
-- One row can be flagged is_own to represent your own brand; the rest are competitors.

CREATE TABLE IF NOT EXISTS "ads_competitors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "terms" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_own" boolean NOT NULL DEFAULT false,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_competitors_own_idx" ON "ads_competitors" ("is_own");
ALTER TABLE "ads_competitors" ENABLE ROW LEVEL SECURITY;
