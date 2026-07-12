-- Ads P2 (media): a reusable media library + carousel-ready image list on posts.

-- Ordered image list on a post (imageUrl mirrors the first entry for back-compat / API publish).
ALTER TABLE "ads_posts" ADD COLUMN IF NOT EXISTS "image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Library of uploaded assets, reusable across posts.
CREATE TABLE IF NOT EXISTS "ads_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "url" text NOT NULL,
  "kind" varchar(10) DEFAULT 'image' NOT NULL,
  "filename" varchar(255),
  "size_bytes" integer,
  "uploaded_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ads_media_url_idx" ON "ads_media" ("url");
CREATE INDEX IF NOT EXISTS "ads_media_kind_idx" ON "ads_media" ("kind", "created_at");
ALTER TABLE "ads_media" ENABLE ROW LEVEL SECURITY;
