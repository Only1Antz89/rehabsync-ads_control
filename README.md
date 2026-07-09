# RehabSync Ads Centre

IntAillium's in-house social-media management tool at **adscentre.rehabsync.app**.

- Compose once, publish to many: Meta (Facebook + Instagram), LinkedIn, TikTok, YouTube
  (X/Twitter via manual-export), with scheduling + content calendar
- Engagement analytics (impressions, reach, interactions, follower growth, best-time heatmaps)
- Newsletters (consent-based subscribers, composer, SMTP2GO sends, open/click analytics)
- Access: RehabSync platform super-admins via SSO + per-tool `admin`/`user` staff accounts

**Start here → [BUILD_PLAN.md](./BUILD_PLAN.md)** (full architecture, data model, milestones).
Agent conventions → [CLAUDE.md](./CLAUDE.md).

Stack: Next.js 15 · React 19 · TypeScript (strict) · Tailwind v4 · Drizzle ORM · shared
RehabSync Supabase Postgres · Supabase Storage · Vercel Cron.

## Running locally

```bash
pnpm install
cp .env.example .env           # fill in REHABSYNC_DATABASE_URL (+ REHABSYNC_API_URL for SSO)
pnpm db:deploy                 # applies drizzle/*.sql, tracked in _ads_applied_migrations
pnpm staff:create -- --email you@intaillium.com --name "You" --password 'changeme-now' --role admin
pnpm dev                       # http://localhost:3000
```

Platform super-admins (e.g. anthony@intaillium.com) need no staff account — with
`REHABSYNC_API_URL` set and the platform session cookie on `.rehabsync.app`, they are signed in
automatically with full access.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
