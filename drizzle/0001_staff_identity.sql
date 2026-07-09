-- Shared staff identity for the RehabSync internal tools (Sales Centre + Ads Centre).
-- IMPORTANT: this DDL is intentionally IDENTICAL in rehabsync-sales_control and
-- rehabsync-ads_control (each repo's migration 0001) and fully idempotent — whichever app
-- deploys first creates the tables; the other's run is a no-op. Keep the two files in sync.

CREATE TABLE IF NOT EXISTS "staff_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) UNIQUE NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "name" varchar(120) NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "staff_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "staff_users"("id") ON DELETE cascade,
  "token_hash" varchar(128) UNIQUE NOT NULL,
  "tool" varchar(20) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "staff_sessions_user_idx" ON "staff_sessions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "staff_sessions_expires_idx" ON "staff_sessions" USING btree ("expires_at");

CREATE TABLE IF NOT EXISTS "staff_tool_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "staff_users"("id") ON DELETE cascade,
  "tool" varchar(20) NOT NULL,
  "role" varchar(20) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "staff_tool_roles_user_tool_idx" ON "staff_tool_roles" USING btree ("user_id", "tool");

-- RLS enabled with no policies (same model as the main platform): the app connects as the table
-- owner and bypasses RLS; Supabase's anon/authenticated PostgREST roles are denied.
ALTER TABLE "staff_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_tool_roles" ENABLE ROW LEVEL SECURITY;
