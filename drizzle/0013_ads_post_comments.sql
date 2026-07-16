-- Collaboration: internal team comments on a post (visible to staff only, never published).

CREATE TABLE IF NOT EXISTS "ads_post_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "ads_posts"("id") ON DELETE CASCADE,
  "author_email" varchar(255) NOT NULL,
  "author_name" varchar(120),
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_post_comments_post_idx" ON "ads_post_comments" ("post_id", "created_at");
ALTER TABLE "ads_post_comments" ENABLE ROW LEVEL SECURITY;
