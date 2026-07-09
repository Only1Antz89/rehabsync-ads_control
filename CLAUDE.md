# RehabSync Ads Centre — agent working notes

## What this is
IntAillium's in-house social-media management app at `adscentre.rehabsync.app` — multi-platform
composing/scheduling/publishing, engagement analytics, and newsletters. See BUILD_PLAN.md for the
full design; build milestones in order, one PR per milestone.

## Non-negotiable rules
- **Shared DB**: same Supabase Postgres as the main RehabSync platform. This app owns `ads_*` and
  shared `staff_*` tables. Never modify tables owned by the main app or Sales Centre.
- **Auth**: platform super-admins (`platform_admins.role = super_admin`, e.g.
  anthony@intaillium.com) get full access via the `rs_platform_session` cookie verified against
  `GET {REHABSYNC_API_URL}/api/v1/admin/auth/me`. Staff users in shared `staff_users` +
  `staff_tool_roles` (tool `ads`, roles `admin`|`user`). Deny by default; audit every mutation to
  `ads_audit_logs`.
- **Tokens**: social OAuth tokens AES-256-GCM encrypted at rest (`REHABSYNC_ENCRYPTION_KEY`),
  never logged, never shipped to the browser.
- **Platforms v1**: Meta (FB Pages + IG Business) first-class; LinkedIn, TikTok, YouTube per
  BUILD_PLAN milestones. X/Twitter is manual-export ONLY (no paid API). Every unconnected platform
  must work via manual-export mode — never block the tool on a third-party app review.
- **Newsletter compliance (UK GDPR/PECR)**: consent-based subscribers only (double opt-in on the
  public form, consent source stored on import), suppression enforced at send, signed one-click
  unsubscribe that works logged out.
- **No patient/clinical data** in this tool.
- Migrations: manual idempotent SQL in `drizzle/`, tracked in `_ads_applied_migrations`. RLS
  enabled, no policies (owner connection).

## Stack & conventions (parity with the RehabSync monorepo)
- Next.js 15 App Router (full-stack), React 19, TypeScript strict (no `any`), Tailwind v4,
  Drizzle ORM + `postgres` driver, lucide-react, recharts.
- Env: `REHABSYNC_` prefix via `process.env['VAR']`. Timezone for scheduling: Europe/London.
- Branding: copied RehabSync tokens + UI kit (teal `#0d9488` on navy `#102a43`), badge
  "Ads Centre".
- All platform publishing goes through one provider interface (`lib/social/provider.ts`) —
  `connect / refresh / publish / fetchPostMetrics / fetchAccountMetrics / validate`. Add platforms
  by implementing the interface, never by scattering platform ifs.
- Jobs: Vercel Cron → `/api/cron/publish-due` (5 min), `sync-metrics` (hourly),
  `send-newsletters`; `CRON_SECRET` bearer-guarded; publish claims use `FOR UPDATE SKIP LOCKED`.
- Media: Supabase Storage bucket `ads-media`.
- Tests: vitest for pure logic (per-platform validators, UTM tagger, tokens, rollups);
  `tsc --noEmit` + ESLint gate every PR.

## Sibling repos
- Main platform: `Only1Antz89/RehabSync` (source of copied auth/crypto/UI patterns).
- Sales Centre: `Only1Antz89/rehabsync-sales_control` (shares `staff_*` identity tables — keep
  migration 0001 DDL identical in both repos; its BUILD_PLAN §11 defines the shared main-repo
  integration PR).
