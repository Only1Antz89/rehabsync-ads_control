-- Brand kit: a single-row store for the tenant's brand voice, colours, logo, default hashtags and
-- boilerplate. Feeds the composer (hashtag insert) and the AI caption prompt (voice).

CREATE TABLE IF NOT EXISTS "ads_brand_kit" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "primary_color" varchar(9),
  "secondary_color" varchar(9),
  "logo_url" text,
  "voice" text,
  "hashtags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "boilerplate" text,
  "updated_by" varchar(255),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ads_brand_kit_singleton" CHECK ("id" = 1)
);
INSERT INTO "ads_brand_kit" ("id") VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE "ads_brand_kit" ENABLE ROW LEVEL SECURITY;
