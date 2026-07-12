-- Cron controller: a per-job enable switch + last-run telemetry so scheduled automation can be
-- paused from the admin UI (an external scheduler still pings the endpoints; disabled jobs no-op).
CREATE TABLE IF NOT EXISTS "ads_cron_jobs" (
  "key" varchar(40) PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_run_at" timestamp,
  "last_status" varchar(20),
  "last_detail" jsonb,
  "updated_by" varchar(255),
  "updated_at" timestamp DEFAULT now() NOT NULL
);
INSERT INTO "ads_cron_jobs" ("key") VALUES ('publish'), ('newsletters'), ('metrics') ON CONFLICT DO NOTHING;
ALTER TABLE "ads_cron_jobs" ENABLE ROW LEVEL SECURITY;
