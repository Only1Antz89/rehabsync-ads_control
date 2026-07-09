-- M3: consent-based newsletters — subscribers (double opt-in), issues, per-recipient tracking,
-- SMTP2GO events and the suppression list. All idempotent; RLS enabled (service-role access only).

CREATE TABLE IF NOT EXISTS "ads_subscribers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "name" varchar(160),
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "consent_source" varchar(120) NOT NULL,
  "consent_at" timestamp,
  "confirm_sent_at" timestamp,
  "unsubscribed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ads_subscribers_email_idx" ON "ads_subscribers" (lower("email"));
CREATE INDEX IF NOT EXISTS "ads_subscribers_status_idx" ON "ads_subscribers" ("status");
ALTER TABLE "ads_subscribers" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ads_newsletters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "subject" varchar(255) NOT NULL,
  "html" text DEFAULT '' NOT NULL,
  "segment" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamp,
  "sent_at" timestamp,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_newsletters_status_idx" ON "ads_newsletters" ("status", "scheduled_at");
ALTER TABLE "ads_newsletters" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ads_newsletter_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "newsletter_id" uuid NOT NULL REFERENCES "ads_newsletters"("id") ON DELETE CASCADE,
  "subscriber_id" uuid REFERENCES "ads_subscribers"("id") ON DELETE SET NULL,
  "email" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "message_id" varchar(160),
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ads_newsletter_recipients_unique_idx"
  ON "ads_newsletter_recipients" ("newsletter_id", "email");
CREATE INDEX IF NOT EXISTS "ads_newsletter_recipients_status_idx"
  ON "ads_newsletter_recipients" ("newsletter_id", "status");
CREATE INDEX IF NOT EXISTS "ads_newsletter_recipients_msg_idx" ON "ads_newsletter_recipients" ("message_id");
ALTER TABLE "ads_newsletter_recipients" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ads_email_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "newsletter_id" uuid REFERENCES "ads_newsletters"("id") ON DELETE CASCADE,
  "recipient_id" uuid REFERENCES "ads_newsletter_recipients"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "event" varchar(20) NOT NULL,
  "url" text,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_email_events_newsletter_idx" ON "ads_email_events" ("newsletter_id", "event");
ALTER TABLE "ads_email_events" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ads_suppressions" (
  "email" varchar(255) PRIMARY KEY NOT NULL,
  "reason" varchar(30) DEFAULT 'unsubscribed' NOT NULL,
  "source" varchar(60),
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "ads_suppressions" ENABLE ROW LEVEL SECURITY;
