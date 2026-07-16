-- Content library: reusable caption snippets that can be inserted into the composer.

CREATE TABLE IF NOT EXISTS "ads_content_snippets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(160) NOT NULL,
  "body" text NOT NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_content_snippets_created_idx" ON "ads_content_snippets" ("created_at");
ALTER TABLE "ads_content_snippets" ENABLE ROW LEVEL SECURITY;
