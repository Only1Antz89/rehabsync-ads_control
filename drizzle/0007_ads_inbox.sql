-- Ads P1: unified inbox — audience engagement (comments / mentions / DMs / reviews) across the
-- connected social networks, ingested by webhook and triaged/answered by the team.

CREATE TABLE IF NOT EXISTS "ads_inbox_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid REFERENCES "ads_social_accounts"("id") ON DELETE SET NULL,
  "platform" varchar(20) NOT NULL,
  "external_id" varchar(200) NOT NULL,
  "kind" varchar(20) DEFAULT 'comment' NOT NULL,
  "author_name" varchar(200),
  "author_handle" varchar(200),
  "permalink" varchar(600),
  "snippet" text,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "assigned_to" varchar(255),
  "unread" boolean DEFAULT true NOT NULL,
  "last_message_at" timestamp DEFAULT now() NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ads_inbox_threads_platform_ext_idx" ON "ads_inbox_threads" ("platform", "external_id");
CREATE INDEX IF NOT EXISTS "ads_inbox_threads_status_idx" ON "ads_inbox_threads" ("status", "last_message_at");
ALTER TABLE "ads_inbox_threads" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ads_inbox_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL REFERENCES "ads_inbox_threads"("id") ON DELETE CASCADE,
  "direction" varchar(10) NOT NULL,
  "external_id" varchar(200),
  "author_name" varchar(200),
  "body" text NOT NULL,
  "status" varchar(20) DEFAULT 'received' NOT NULL,
  "sent_by" varchar(255),
  "error_text" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ads_inbox_messages_thread_idx" ON "ads_inbox_messages" ("thread_id", "created_at");
ALTER TABLE "ads_inbox_messages" ENABLE ROW LEVEL SECURITY;
