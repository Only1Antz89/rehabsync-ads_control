import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ── Shared staff identity (owned jointly with Sales Centre; DDL in drizzle/0001) ────────

export const STAFF_TOOLS = ['sales', 'ads'] as const;
export type StaffTool = (typeof STAFF_TOOLS)[number];

export const STAFF_ROLES = ['admin', 'user'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const staffUsers = pgTable('staff_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).unique().notNull(),
    tool: varchar('tool', { length: 20 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    lastSeenAt: timestamp('last_seen_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('staff_sessions_user_idx').on(table.userId),
    index('staff_sessions_expires_idx').on(table.expiresAt),
  ],
);

export const staffToolRoles = pgTable(
  'staff_tool_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    tool: varchar('tool', { length: 20 }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('staff_tool_roles_user_tool_idx').on(table.userId, table.tool)],
);

// ── Ads Centre tables (owned by this repo) ─────────────────────────────────────────────

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'x'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const POST_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'partial', 'failed'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const TARGET_STATUSES = ['pending', 'publishing', 'published', 'failed', 'manual', 'manual_done'] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const adsSocialAccounts = pgTable(
  'ads_social_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: varchar('platform', { length: 20 }).notNull(),
    externalId: varchar('external_id', { length: 120 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    avatarUrl: text('avatar_url'),
    accessTokenEnc: text('access_token_enc'),
    refreshTokenEnc: text('refresh_token_enc'),
    tokenExpiresAt: timestamp('token_expires_at'),
    scopes: text('scopes'),
    status: varchar('status', { length: 20 }).notNull().default('connected'),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
    connectedBy: varchar('connected_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('ads_social_accounts_platform_ext_idx').on(table.platform, table.externalId)],
);

export const APPROVAL_STATUSES = ['approved', 'pending', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const adsPosts = pgTable(
  'ads_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    body: text('body').notNull().default(''),
    linkUrl: text('link_url'),
    imageUrl: text('image_url'),
    // Carousel-ready ordered image list (P2 media). imageUrl mirrors the first entry.
    imageUrls: jsonb('image_urls').$type<string[]>().default([]).notNull(),
    videoUrl: text('video_url'),
    title: varchar('title', { length: 100 }),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    approvalStatus: varchar('approval_status', { length: 20 }).notNull().default('approved'),
    approvalNote: text('approval_note'),
    approvedBy: varchar('approved_by', { length: 255 }),
    approvedAt: timestamp('approved_at'),
    scheduledAt: timestamp('scheduled_at'),
    publishedAt: timestamp('published_at'),
    createdBy: varchar('created_by', { length: 255 }),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('ads_posts_status_sched_idx').on(table.status, table.scheduledAt),
    index('ads_posts_approval_idx').on(table.approvalStatus),
  ],
);

export const adsPostTargets = pgTable(
  'ads_post_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => adsPosts.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => adsSocialAccounts.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 20 }).notNull(),
    // Per-network caption override (P2). Null = use the post's base body.
    bodyOverride: text('body_override'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    platformPostId: varchar('platform_post_id', { length: 160 }),
    platformUrl: text('platform_url'),
    error: text('error'),
    attemptCount: integer('attempt_count').notNull().default(0),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('ads_post_targets_post_idx').on(table.postId),
    index('ads_post_targets_status_idx').on(table.status),
  ],
);

// ── Scheduling queue (P2): weekly posting slots; "add to queue" fills the next free one. ──
export const adsPostingSlots = pgTable(
  'ads_posting_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weekday: smallint('weekday').notNull(), // 0=Sunday … 6=Saturday (UTC)
    minutes: integer('minutes').notNull(), // minutes since midnight (UTC)
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('ads_posting_slots_unique_idx').on(table.weekday, table.minutes)],
);

// ── Media library (P2 media): reusable uploaded assets, pickable in the composer. ──
export const adsMedia = pgTable(
  'ads_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    url: text('url').notNull(),
    kind: varchar('kind', { length: 10 }).notNull().default('image'),
    filename: varchar('filename', { length: 255 }),
    sizeBytes: integer('size_bytes'),
    uploadedBy: varchar('uploaded_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ads_media_url_idx').on(table.url),
    index('ads_media_kind_idx').on(table.kind, table.createdAt),
  ],
);

export const adsPostMetrics = pgTable(
  'ads_post_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetId: uuid('target_id')
      .notNull()
      .references(() => adsPostTargets.id, { onDelete: 'cascade' }),
    capturedAt: timestamp('captured_at').defaultNow().notNull(),
    impressions: integer('impressions').notNull().default(0),
    reach: integer('reach').notNull().default(0),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    videoViews: integer('video_views').notNull().default(0),
    raw: jsonb('raw').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [index('ads_post_metrics_target_idx').on(table.targetId, table.capturedAt)],
);

export const adsAccountMetrics = pgTable(
  'ads_account_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => adsSocialAccounts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    followers: integer('followers').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    reach: integer('reach').notNull().default(0),
    raw: jsonb('raw').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [uniqueIndex('ads_account_metrics_account_date_idx').on(table.accountId, table.date)],
);

/** Single-row tool settings (id is always 1). */
export const adsSettings = pgTable('ads_settings', {
  id: smallint('id').primaryKey().default(1),
  requireApproval: boolean('require_approval').notNull().default(false),
  utmSource: varchar('utm_source', { length: 80 }).notNull().default(''),
  utmMedium: varchar('utm_medium', { length: 80 }).notNull().default(''),
  utmCampaign: varchar('utm_campaign', { length: 80 }).notNull().default(''),
  timezone: varchar('timezone', { length: 60 }).notNull().default('Europe/London'),
  updatedBy: varchar('updated_by', { length: 255 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Newsletters (M3) ───────────────────────────────────────────────────────────────────

export const SUBSCRIBER_STATUSES = ['pending', 'active', 'unsubscribed', 'bounced'] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export const NEWSLETTER_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

/** Audience filter stored on a newsletter: missing/empty tags mean "all active subscribers". */
export interface NewsletterSegment {
  tags?: string[];
}

export const adsSubscribers = pgTable(
  'ads_subscribers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 160 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    consentSource: varchar('consent_source', { length: 120 }).notNull(),
    consentAt: timestamp('consent_at'),
    confirmSentAt: timestamp('confirm_sent_at'),
    unsubscribedAt: timestamp('unsubscribed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('ads_subscribers_status_idx').on(table.status)],
);

export const adsNewsletters = pgTable(
  'ads_newsletters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    html: text('html').notNull().default(''),
    segment: jsonb('segment').$type<NewsletterSegment>().default({}).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    scheduledAt: timestamp('scheduled_at'),
    sentAt: timestamp('sent_at'),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('ads_newsletters_status_idx').on(table.status, table.scheduledAt)],
);

export const adsNewsletterRecipients = pgTable(
  'ads_newsletter_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    newsletterId: uuid('newsletter_id')
      .notNull()
      .references(() => adsNewsletters.id, { onDelete: 'cascade' }),
    subscriberId: uuid('subscriber_id').references(() => adsSubscribers.id, { onDelete: 'set null' }),
    email: varchar('email', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    messageId: varchar('message_id', { length: 160 }),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ads_newsletter_recipients_unique_idx').on(table.newsletterId, table.email),
    index('ads_newsletter_recipients_status_idx').on(table.newsletterId, table.status),
    index('ads_newsletter_recipients_msg_idx').on(table.messageId),
  ],
);

export const adsEmailEvents = pgTable(
  'ads_email_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    newsletterId: uuid('newsletter_id').references(() => adsNewsletters.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id').references(() => adsNewsletterRecipients.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    event: varchar('event', { length: 20 }).notNull(),
    url: text('url'),
    raw: jsonb('raw').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('ads_email_events_newsletter_idx').on(table.newsletterId, table.event)],
);

export const adsSuppressions = pgTable('ads_suppressions', {
  email: varchar('email', { length: 255 }).primaryKey(),
  reason: varchar('reason', { length: 30 }).notNull().default('unsubscribed'),
  source: varchar('source', { length: 60 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Unified inbox: engagement (comments / mentions / DMs / reviews) across connected networks ──
export const INBOX_THREAD_KINDS = ['comment', 'mention', 'dm', 'reply', 'review'] as const;
export type InboxThreadKind = (typeof INBOX_THREAD_KINDS)[number];

export const INBOX_STATUSES = ['open', 'pending', 'closed', 'spam'] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const adsInboxThreads = pgTable(
  'ads_inbox_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').references(() => adsSocialAccounts.id, { onDelete: 'set null' }),
    platform: varchar('platform', { length: 20 }).notNull(),
    externalId: varchar('external_id', { length: 200 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull().default('comment'),
    authorName: varchar('author_name', { length: 200 }),
    authorHandle: varchar('author_handle', { length: 200 }),
    permalink: varchar('permalink', { length: 600 }),
    snippet: text('snippet'),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    assignedTo: varchar('assigned_to', { length: 255 }),
    unread: boolean('unread').notNull().default(true),
    lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ads_inbox_threads_platform_ext_idx').on(table.platform, table.externalId),
    index('ads_inbox_threads_status_idx').on(table.status, table.lastMessageAt),
  ],
);

export const INBOX_MESSAGE_STATUSES = ['received', 'queued', 'sent', 'failed'] as const;
export type InboxMessageStatus = (typeof INBOX_MESSAGE_STATUSES)[number];

export const adsInboxMessages = pgTable(
  'ads_inbox_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => adsInboxThreads.id, { onDelete: 'cascade' }),
    direction: varchar('direction', { length: 10 }).notNull(), // 'in' (from the audience) | 'out' (our reply)
    externalId: varchar('external_id', { length: 200 }),
    authorName: varchar('author_name', { length: 200 }),
    body: text('body').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('received'),
    sentBy: varchar('sent_by', { length: 255 }),
    errorText: text('error_text'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('ads_inbox_messages_thread_idx').on(table.threadId, table.createdAt)],
);

// ── Cron controller: per-job enable switch + last-run telemetry (managed in /admin/automation) ──
export const adsCronJobs = pgTable('ads_cron_jobs', {
  key: varchar('key', { length: 40 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at'),
  lastStatus: varchar('last_status', { length: 20 }),
  lastDetail: jsonb('last_detail').$type<Record<string, unknown>>(),
  updatedBy: varchar('updated_by', { length: 255 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const adsAuditLogs = pgTable(
  'ads_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorEmail: varchar('actor_email', { length: 255 }).notNull(),
    actorKind: varchar('actor_kind', { length: 30 }).notNull(),
    action: varchar('action', { length: 60 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('ads_audit_logs_created_idx').on(table.createdAt)],
);
