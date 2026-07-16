-- Canva Connect integration — design exports (Batch 3). Each row is one "prepare for composer" run:
-- Canva renders the design, we download it, store it permanently in Supabase Storage and record it in
-- ads_media, then keep the job + checksum here so identical re-exports are de-duplicated.

CREATE TABLE IF NOT EXISTS "canva_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "canva_content_item_id" uuid REFERENCES "canva_content_items" ("id") ON DELETE SET NULL,
  "canva_design_id" varchar(200) NOT NULL,
  "job_id" varchar(200),
  "format" varchar(10) NOT NULL DEFAULT 'png',
  "status" varchar(12) NOT NULL DEFAULT 'pending',
  "media_id" uuid REFERENCES "ads_media" ("id") ON DELETE SET NULL,
  "checksum" varchar(64),
  "size_bytes" integer,
  "reused" boolean NOT NULL DEFAULT false,
  "error" text,
  "requested_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
CREATE INDEX IF NOT EXISTS "canva_exports_design_idx" ON "canva_exports" ("canva_design_id");
CREATE INDEX IF NOT EXISTS "canva_exports_checksum_idx" ON "canva_exports" ("checksum");
CREATE INDEX IF NOT EXISTS "canva_exports_item_idx" ON "canva_exports" ("canva_content_item_id");
ALTER TABLE "canva_exports" ENABLE ROW LEVEL SECURITY;
