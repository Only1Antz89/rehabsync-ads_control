-- Canva Connect integration — synced designs (Batch 2). One row per Canva design found in a mapped
-- workflow folder (Drafts / Ready / Published). `stage` is the furthest-along folder the design is in;
-- `stages` lists every mapped folder it currently appears in (a design can sit in more than one).
-- Thumbnails are Canva-signed URLs that expire — a re-sync refreshes them.

CREATE TABLE IF NOT EXISTS "canva_content_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "canva_design_id" varchar(200) NOT NULL,
  "stage" varchar(12) NOT NULL,
  "stages" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "title" varchar(500),
  "thumbnail_url" text,
  "edit_url" text,
  "status" varchar(12) NOT NULL DEFAULT 'active',
  "canva_updated_at" timestamp,
  "last_synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "canva_content_items_design_idx" ON "canva_content_items" ("canva_design_id");
CREATE INDEX IF NOT EXISTS "canva_content_items_stage_idx" ON "canva_content_items" ("stage", "status");
ALTER TABLE "canva_content_items" ENABLE ROW LEVEL SECURITY;
