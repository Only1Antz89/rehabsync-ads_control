# Ads Centre — deployment & integration runbook

Standalone Next.js app at **https://adscentre.rehabsync.app**, sharing the main platform's
Supabase Postgres. All application code is complete (M0–M4); everything below is wiring.

## 1. One-time platform prerequisites (main RehabSync repo)

Merge the integration changes (branch `claude/rehabsync-equipment-mvp-5eww8m`), which provide:
- `rs_platform_session` cookie spanning `.rehabsync.app` in production (override with
  `REHABSYNC_PLATFORM_COOKIE_DOMAIN` on the API if ever needed) → super-admin SSO into this tool.
- `adscentre` reserved in the tenant-subdomain middleware.
- Admin sidebar "Internal tools" links (`NEXT_PUBLIC_ADS_CENTRE_URL`, defaults to the prod URL).

## 2. Vercel project

1. Import `Only1Antz89/rehabsync-ads_control`, framework Next.js, root `/`.
2. Attach domain `adscentre.rehabsync.app`; DNS: CNAME `adscentre` → `cname.vercel-dns.com`.
3. Scheduled jobs — see **Scheduled jobs** below (external triggers on Hobby).

## 3. Environment variables (see `.env.example`)

| Variable | Notes |
|---|---|
| `REHABSYNC_DATABASE_URL` | Supabase **pooler** string (same DB as the platform) |
| `REHABSYNC_API_URL` | `https://api.rehabsync.app` — verifies super-admin SSO |
| `REHABSYNC_NODE_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` | `https://adscentre.rehabsync.app` (used in emails/links) |
| `REHABSYNC_SESSION_SECRET` | random 32+ chars |
| `REHABSYNC_ENCRYPTION_KEY` | random 32+ chars — AES-256-GCM for OAuth tokens at rest |
| `REHABSYNC_ADS_EMAIL_TOKEN_SECRET` | random 32+ chars — signs unsubscribe/confirm links |
| `CRON_SECRET` | random — Vercel sends it as the cron Authorization bearer |
| `REHABSYNC_SMTP2GO_API_KEY` | newsletters |
| `REHABSYNC_SMTP2GO_WEBHOOK_SECRET` | shared secret for the events webhook |
| `REHABSYNC_EMAIL_SENDER` | e.g. `RehabSync <news@rehabsync.app>` (domain must be SMTP2GO-verified) |
| `REHABSYNC_COMPANY_ADDRESS` | shown in the compliance footer |
| `REHABSYNC_SUPABASE_URL` / `REHABSYNC_SUPABASE_SERVICE_KEY` | media uploads (see §5) |
| `META_APP_ID` / `META_APP_SECRET` | Facebook + Instagram publishing |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | once the Community Management app is approved |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | once the Content Posting audit passes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | once the Google OAuth app is verified (YouTube) |

Platforms without credentials simply stay in manual-export mode — nothing breaks.

## 4. Database

```bash
REHABSYNC_DATABASE_URL=<pooler-url> pnpm db:deploy   # applies drizzle/0001..0005, idempotent
pnpm staff:create -- --email <email> --name "<name>" --password '<pw>' --role admin
```

`staff_*` tables are shared with Sales Centre (identical DDL — whichever repo migrates first
creates them). Platform super-admins never need a staff account.

## Scheduled jobs (Vercel Hobby)

Three jobs need to run on a schedule. **Vercel's Hobby plan runs cron jobs at most once per day
and caps the count** — too infrequent (and too many) for these — so there is no `vercel.json` in
this repo. Drive each `CRON_SECRET`-secured endpoint from an external scheduler
([cron-job.org](https://cron-job.org), EasyCron, or a GitHub Actions `schedule` workflow) with an
`Authorization: Bearer <CRON_SECRET>` header. All three are idempotent and safe to over-call.

| Endpoint | Frequency |
|---|---|
| `GET /api/cron/publish-due` | every ~5 minutes (publishes scheduled posts) |
| `GET /api/cron/sync-metrics` | hourly (pulls engagement + follower snapshots) |
| `GET /api/cron/send-newsletters` | every ~10 minutes (sends due newsletter batches) |

Base URL: `https://adscentre.rehabsync.app`.

**On Vercel Pro** you can let Vercel run them instead — add `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/publish-due", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/sync-metrics", "schedule": "0 * * * *" },
    { "path": "/api/cron/send-newsletters", "schedule": "*/10 * * * *" }
  ]
}
```

## 5. Supabase Storage (media uploads)

Create a **public** bucket named `ads-media`. Uploads are signed server-side and PUT directly
from the browser (nothing flows through Vercel functions). Caps: images 8 MB, video 200 MB.
Without the two env vars, the composer still accepts pasted media URLs.

## 6. SMTP2GO

- Verify the sender domain (SPF/DKIM), e.g. `news.rehabsync.app`.
- Add an events webhook → `https://adscentre.rehabsync.app/api/webhooks/smtp2go?secret=<REHABSYNC_SMTP2GO_WEBHOOK_SECRET>`
  for delivered/open/click/bounce/spam/unsubscribe.

## 7. OAuth redirect URIs (register per platform app)

- Meta: `https://adscentre.rehabsync.app/api/oauth/meta/callback`
- LinkedIn: `https://adscentre.rehabsync.app/api/oauth/linkedin/callback`
- TikTok: `https://adscentre.rehabsync.app/api/oauth/tiktok/callback`
- Google: `https://adscentre.rehabsync.app/api/oauth/youtube/callback`

## 8. Post-deploy smoke test

1. `https://adscentre.rehabsync.app/api/health` → 200.
2. Log into `admin.rehabsync.app` as a super-admin, then open the Ads Centre — the dashboard must
   load with no second login (SSO via the shared cookie).
3. Staff login works; a `user`-role account sees no Administration group.
4. Connect Meta under Connections; compose → publish; check the post URL.
5. `/n/subscribe` (logged out) → confirmation email arrives → confirm → subscriber active.
6. Send a test newsletter; open/click events appear on the issue report after the webhook fires.
