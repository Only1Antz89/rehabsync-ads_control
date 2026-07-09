# RehabSync Ads Centre — Build Plan

**Repo:** `Only1Antz89/rehabsync-ads_control` · **URL:** `https://adscentre.rehabsync.app`
**What it is:** IntAillium's in-house social-media management tool — compose once and publish to
multiple platforms, schedule content, track engagement, and run newsletters, with analytics across
all of it.

---

## 1. Context & goals

IntAillium needs to market RehabSync (and clinic-facing content) across social platforms without
paying for Hootsuite/Buffer. Ads Centre is a standalone app: connect the company's social accounts,
compose/schedule posts to several platforms at once, pull engagement metrics back for analytics,
and manage email newsletters end-to-end.

Sister app: **Sales Centre** (`rehabsync-sales_control` → `salescentre.rehabsync.app`) for
lead-gen/CRM + email marketing. Both apps share the same foundations (§3–§5) — keep them consistent.

### Locked decisions
1. **Shared Supabase Postgres** with the main RehabSync platform; new tables prefixed `ads_*`
   (plus shared `staff_*` identity tables, same DDL as the sales repo).
2. **Standalone full-stack Next.js app** (route handlers + server components + Drizzle).
3. **Platforms v1 (first-class OAuth publishing): Meta (Facebook Pages + Instagram Business),
   LinkedIn, TikTok, YouTube.** X/Twitter is *manual-export only* (paid API tier not justified
   yet). Any platform not yet connected/approved falls back to **manual-export mode** (§7.2) so
   the tool is useful from day one.
4. **SMTP2GO** for newsletter sending (same provider/patterns as Sales Centre).
5. **`anthony@intaillium.com` works day one** via platform super-admin SSO (§4).

## 2. Stack (parity with RehabSync)

Next.js 15 App Router · React 19 · TypeScript strict (no `any`) · Tailwind v4 · Drizzle ORM
(`postgres` driver → Supabase pooler) · lucide-react · recharts. Env vars `REHABSYNC_` prefix;
manual SQL migrations (§10).

## 3. Architecture

```
adscentre.rehabsync.app ──► Vercel project (this repo)
   ├── /api/oauth/[platform]/*     connect flows (tokens AES-256-GCM at rest)
   ├── /api/cron/publish-due       every 5 min: publish scheduled posts
   ├── /api/cron/sync-metrics      hourly: pull engagement + follower stats
   ├── /api/cron/send-newsletters  batch newsletter sends
   └── shared Supabase Postgres    ads_* · staff_* · platform_admins (SSO)
Media: Supabase Storage bucket `ads-media` (images/video for posts).
```

- DNS: `adscentre` CNAME → Vercel; subdomain reserved in the main app's middleware (see the sales
  repo's BUILD_PLAN §11 — one shared main-repo PR covers both tools).
- Background jobs: Vercel Cron → `/api/cron/*` guarded by `CRON_SECRET`. Publish worker retries
  transient failures (3 attempts, backoff) and surfaces per-target errors in the UI.

## 4. Identity & access

Identical model to Sales Centre (see its BUILD_PLAN §4 for detail):
1. **Platform super-admin SSO** — `rs_platform_session` cookie (domain-widened to
   `.rehabsync.app`) verified against `GET {REHABSYNC_API_URL}/api/v1/admin/auth/me`;
   `super_admin` → full access.
2. **Staff login** — shared `staff_users` / `staff_sessions` / `staff_tool_roles` tables
   (`tool = 'ads'`), cookie `rs_ads_session`, bcrypt + sha256 opaque tokens (pattern copied from
   the main repo's `platform-auth.service.ts`).

**RBAC (this tool):**
| Capability | user | admin | super_admin |
|---|---|---|---|
| Compose/edit drafts, view calendar & analytics | ✓ | ✓ | ✓ |
| Schedule/publish posts | ✓* | ✓ | ✓ |
| Connect/disconnect social accounts | — | ✓ | ✓ |
| Newsletters: draft | ✓ | ✓ | ✓ |  send | — | ✓ | ✓ |
| Invite/disable users, settings, audit log | — | ✓ | ✓ |

\* configurable: settings toggle "posts by `user` role require admin approval" (default off).
Every mutation writes `ads_audit_logs`.

## 5. Branding

RehabSync look-and-feel, badged **"RehabSync Ads Centre"** — same copied token set + UI kit +
wordmark/sidebar shell as the sales repo (BUILD_PLAN §5). Keep both apps visually identical to the
platform (teal `#0d9488` on deep navy `#102a43`, `--bg-card`/`--text-*` tokens, dark mode).

## 6. Data model (new tables, `ads_*`)

- `ads_social_accounts` — id, platform(`facebook`|`instagram`|`linkedin`|`tiktok`|`youtube`|`x`),
  external_id, display_name, avatar_url, access_token_enc, refresh_token_enc, token_expires_at,
  scopes, status(connected|expired|revoked|error), meta jsonb (page id, IG business id, channel id…),
  connected_by, timestamps. Unique(platform, external_id).
- `ads_posts` — id, body text, link_url, media jsonb[{storage_key, type, alt}], status(draft|
  approval_pending|scheduled|publishing|published|partial|failed), scheduled_at, published_at,
  created_by, approved_by?, tags jsonb, timestamps. Index (status, scheduled_at).
- `ads_post_targets` — post_id, account_id, status(pending|publishing|published|failed|skipped|
  manual), platform_post_id?, platform_url?, error?, attempt_count, published_at.
  Unique(post_id, account_id).
- `ads_post_metrics` — target_id, captured_at, impressions, reach, likes, comments, shares, clicks,
  video_views, saves, raw jsonb. (Snapshot rows; latest-per-target for dashboards, series for trends.)
- `ads_account_metrics` — account_id, date, followers, impressions, reach, profile_views, raw jsonb.
  Unique(account_id, date).
- `ads_newsletters` — id, name, subject, html, text, status(draft|scheduled|sending|sent|cancelled),
  scheduled_at, sent_at, counts, created_by, timestamps.
- `ads_newsletter_subscribers` — id, email (unique), name?, status(subscribed|unsubscribed|bounced),
  source(embed|import|manual), consent_at, unsubscribed_at, tags jsonb, timestamps.
- `ads_newsletter_recipients` — newsletter_id, subscriber_id, email, status, message_id.
  Unique(newsletter_id, subscriber_id).
- `ads_email_events` — newsletter_id?, recipient_id?, email, event(sent|delivered|open|click|bounce|
  spam|unsub), url?, raw jsonb, created_at.
- `ads_suppressions` — email unique, reason, created_at.
- `ads_audit_logs` — actor_email, actor_kind, action, entity_type, entity_id?, metadata jsonb,
  created_at.

## 7. Feature modules

### 7.1 Social account connections — M1 (Meta), M3 (LinkedIn), M4 (TikTok/YouTube)
OAuth per platform behind one provider interface (`lib/social/provider.ts`:
`connect / refresh / publish / fetchPostMetrics / fetchAccountMetrics / validate`):
- **Meta**: one Meta app → Facebook Login; select Page(s) + linked IG Business account(s); Graph
  API publishing (`/{page}/photos|feed`, IG `media` + `media_publish` container flow). Long-lived
  page tokens.
- **LinkedIn**: 3-legged OAuth, Community Management API (company-page posts). *App approval takes
  days–weeks — apply at M0.*
- **TikTok**: Content Posting API (audited scopes). **YouTube**: Google OAuth + YouTube Data API v3
  (video upload, requires verification for production quota). Video pipeline (upload → Supabase
  Storage → chunked platform upload) lands with these.
- **X/Twitter**: no API in v1 (paid tier) — manual-export only.
- Tokens AES-256-GCM encrypted (`REHABSYNC_ENCRYPTION_KEY`, pattern copied from the main repo's
  `apps/api/src/common/crypto/encrypt.ts`); auto-refresh in cron; `expired` accounts flagged in UI.

### 7.2 Composer, scheduler & calendar — M1
- One composer → many targets: pick connected accounts, per-platform preview + validation
  (character limits, media count/type/aspect, link handling), optional per-platform body override.
- Media upload to `ads-media` (image v1; video with TikTok/YouTube milestone).
- Schedule (date/time, Europe/London) or publish now; month/week **calendar** + list views;
  drag-to-reschedule.
- **Manual-export mode** for unconnected platforms: target renders a checklist card — copy caption,
  download media, deep-link to the platform's composer, mark done (`status=manual`) so the calendar
  and analytics still see the post.
- UTM auto-tagging on links (settings-controlled) so clicks attribute in GA/Sales Centre.

### 7.3 Publish worker — M1
`/api/cron/publish-due` (5-min cadence): claim due posts (`FOR UPDATE SKIP LOCKED`), publish each
target via its provider, store `platform_post_id`/URL, retry ≤3 with backoff, mark `partial` when
some targets fail; failure reasons surfaced on the post card + dashboard alert strip.

### 7.4 Engagement analytics — M2 (Meta), extended per platform
`/api/cron/sync-metrics` (hourly): per-post metrics for the last 30 days of published targets +
daily account snapshots. Dashboards (recharts):
- Overview: impressions/reach/engagement over time, per-platform split, follower growth.
- Post explorer: sortable table (engagement rate = interactions/impressions), top posts, best
  day/hour heatmap.
- Per-account detail: follower trend, posting cadence vs engagement.

### 7.5 Newsletters — M3
- Subscribers: embeddable signup form + hosted page `/n/subscribe` (double-opt-in email via
  SMTP2GO), CSV import (consent source required), tags.
- Composer: reuse the template editor pattern from Sales Centre (merge tags, test-send).
- Sends: cron batches via SMTP2GO; signed one-click unsubscribe → `ads_suppressions` +
  subscriber status; SMTP2GO webhook → `/api/webhooks/smtp2go` → `ads_email_events`.
- Analytics: delivery/open/click/unsub per issue; list growth over time.
- **Compliance (UK GDPR/PECR)**: consent-based list only (no purchased lists), consent timestamp +
  source stored, company footer, suppression enforced at send.

### 7.6 Admin area — M1 (users/connections) / M4 (rest)
User management (shared pattern with Sales Centre), account connections (admin-only), settings
(UTM defaults, approval toggle, timezone), audit log.

## 8. App layout (routes)

```
/login                        staff login + SSO path
/dashboard                    KPIs, due queue, failures, top recent posts
/composer                     new post · /posts/[id] edit
/calendar                     month/week schedule
/posts                        list + statuses/errors
/analytics                    overview · /analytics/accounts/[id]
/newsletters                  list · /newsletters/new · /newsletters/[id] report
/subscribers                  list/import · public: /n/subscribe, /unsubscribe/[token]
/admin                        users · connections · settings · audit (admin+)
/api/oauth/[platform]/start|callback
/api/cron/publish-due | sync-metrics | send-newsletters
/api/webhooks/smtp2go
```

## 9. Environment variables

```
REHABSYNC_DATABASE_URL            shared Supabase pooler string
REHABSYNC_API_URL                 main API origin (SSO verify)
REHABSYNC_ENCRYPTION_KEY          AES-256-GCM for oauth tokens
REHABSYNC_ADS_SESSION_SECRET      staff session cookies
REHABSYNC_SMTP2GO_API_KEY         newsletter sending
REHABSYNC_SMTP2GO_WEBHOOK_SECRET  webhook verification
REHABSYNC_SUPABASE_URL / _SERVICE_KEY   ads-media storage
CRON_SECRET                       Vercel cron auth
NEXT_PUBLIC_APP_URL               https://adscentre.rehabsync.app
META_APP_ID / META_APP_SECRET
LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET
TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET      (YouTube)
```

## 10. Migrations

Manual SQL in `drizzle/`, applied by the copied deploy-migrate runner with tracking table
`_ads_applied_migrations`. Order: `0001_staff_identity.sql` (identical idempotent DDL to sales
repo), `0002_ads_social.sql` (accounts, posts, targets, metrics, audit),
`0003_ads_newsletters.sql`. All tables `ENABLE ROW LEVEL SECURITY` (no policies; app connects as
owner — matches main repo convention).

## 11. Main-repo integration

Covered by the single shared PR described in the sales repo's BUILD_PLAN §11 (cookie domain,
`RESERVED_SUBDOMAINS` += both subdomains, AdminSidebar links).

## 12. External prerequisites (Anthony)

- DNS: `adscentre.rehabsync.app` CNAME → `cname.vercel-dns.com`; Vercel project + env + crons.
- **Meta developer app** (Business type): `pages_manage_posts`, `pages_read_engagement`,
  `instagram_content_publish`, `instagram_manage_insights` — needs App Review + a connected FB
  Page with an IG Business account.
- **LinkedIn developer app**: request Community Management API access early (lead time).
- **TikTok developer app** (Content Posting API audit) + **Google Cloud project** (YouTube Data
  API v3, OAuth consent verification) — needed by M4.
- SMTP2GO: newsletter sender domain (e.g. `news.rehabsync.app`) SPF/DKIM; webhook →
  `https://adscentre.rehabsync.app/api/webhooks/smtp2go`.

## 13. Milestones & acceptance

- **M0 Foundations**: scaffold, brand kit, migration 0001, auth (SSO + staff + RBAC), deployed,
  `/health` green. *Accept: anthony@intaillium.com opens the dashboard with no signup; staff `user`
  blocked from /admin.*
- **M1 Publish MVP**: Meta connect, composer + validation, calendar, publish worker,
  manual-export mode for everything else. *Accept: one composed post publishes to FB + IG on
  schedule and appears with platform URLs; a LinkedIn target completes via manual-export.*
- **M2 Analytics v1**: metric sync + dashboards for connected platforms. *Accept: yesterday's post
  shows impressions/likes/comments within an hour of sync.*
- **M3 Newsletters + LinkedIn**: subscriber capture (double opt-in), composer, sends + webhook
  tracking + unsubscribe; LinkedIn OAuth publishing once approved. *Accept: a test newsletter
  delivers, records opens/clicks, honours unsubscribe; a post publishes to LinkedIn via API.*
- **M4 Video platforms + polish**: TikTok + YouTube upload pipeline, approval workflow, audit log,
  settings; main-repo integration PR merged (shared with Sales Centre).
- Every milestone: `tsc --noEmit` clean, ESLint clean, vitest for pure logic (per-platform
  validators, UTM tagger, unsubscribe tokens, metric rollups).

## 14. Non-negotiables

- OAuth tokens encrypted at rest, never logged, never sent to the browser.
- Newsletter list is consent-based only; suppression respected at every send; one-click
  unsubscribe works logged-out.
- Manual-export mode keeps every platform usable before/without API approval — the tool must never
  be blocked on a third-party review.
- No patient/clinical data in this tool.
