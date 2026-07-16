-- Canva Connect integration — publish orchestration (Batch 4). Links a synced design to the ads_post
-- it was published through, and tracks the "move Ready → Published" step. The design is only moved
-- when EVERY target published; a partial failure leaves it in Ready so a retry can finish the job.

CREATE TABLE IF NOT EXISTS "canva_publish_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "canva_content_item_id" uuid REFERENCES "canva_content_items" ("id") ON DELETE SET NULL,
  "canva_design_id" varchar(200) NOT NULL,
  "post_id" uuid REFERENCES "ads_posts" ("id") ON DELETE SET NULL,
  "status" varchar(16) NOT NULL DEFAULT 'publishing',
  "move_status" varchar(16) NOT NULL DEFAULT 'pending',
  "move_error" text,
  "requested_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
CREATE INDEX IF NOT EXISTS "canva_publish_jobs_design_idx" ON "canva_publish_jobs" ("canva_design_id");
CREATE INDEX IF NOT EXISTS "canva_publish_jobs_post_idx" ON "canva_publish_jobs" ("post_id");
CREATE INDEX IF NOT EXISTS "canva_publish_jobs_status_idx" ON "canva_publish_jobs" ("status", "move_status");
ALTER TABLE "canva_publish_jobs" ENABLE ROW LEVEL SECURITY;
