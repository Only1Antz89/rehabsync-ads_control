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
