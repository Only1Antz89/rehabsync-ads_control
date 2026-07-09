import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
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

export const adsPosts = pgTable(
  'ads_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    body: text('body').notNull().default(''),
    linkUrl: text('link_url'),
    imageUrl: text('image_url'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    scheduledAt: timestamp('scheduled_at'),
    publishedAt: timestamp('published_at'),
    createdBy: varchar('created_by', { length: 255 }),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('ads_posts_status_sched_idx').on(table.status, table.scheduledAt)],
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
