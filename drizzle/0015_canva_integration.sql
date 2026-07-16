-- Canva Connect integration — connection + folder mapping (Batch 1). Single-workspace app, so both
-- are singletons pinned to id=1. Tokens are stored AES-256-GCM encrypted (see lib/crypto.ts).

CREATE TABLE IF NOT EXISTS "canva_connections" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "canva_user_id" varchar(200),
  "access_token_enc" text,
  "refresh_token_enc" text,
  "access_token_expires_at" timestamp,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(30) NOT NULL DEFAULT 'disconnected',
  "last_error" text,
  "connected_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "canva_connections_singleton" CHECK ("id" = 1)
);
INSERT INTO "canva_connections" ("id") VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE "canva_connections" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "canva_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "drafts_folder_id" varchar(200),
  "drafts_folder_name" varchar(300),
  "ready_folder_id" varchar(200),
  "ready_folder_name" varchar(300),
  "published_folder_id" varchar(200),
  "published_folder_name" varchar(300),
  "last_validated_at" timestamp,
  "updated_by" varchar(255),
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "canva_settings_singleton" CHECK ("id" = 1)
);
INSERT INTO "canva_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE "canva_settings" ENABLE ROW LEVEL SECURITY;
