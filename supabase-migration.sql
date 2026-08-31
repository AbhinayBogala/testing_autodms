-- ============================================================
-- DevilX - SAFE ADDITIVE MIGRATION
-- Run once in Supabase SQL Editor.
-- ============================================================

-- Instagram account lifecycle
alter table if exists instagram_accounts
  add column if not exists token_issued_at timestamptz;

alter table if exists instagram_accounts
  add column if not exists token_expires_at timestamptz;

alter table if exists instagram_accounts
  add column if not exists last_token_refresh_at timestamptz;

alter table if exists instagram_accounts
  add column if not exists webhook_subscribed boolean not null default false;

-- Threaded comments
alter table if exists instagram_comments
  add column if not exists parent_comment_id text;

alter table if exists instagram_comments
  add column if not exists automation_id uuid;

create unique index if not exists
  instagram_accounts_instagram_user_id_uidx
  on instagram_accounts(instagram_user_id);

create unique index if not exists
  instagram_posts_account_media_uidx
  on instagram_posts(instagram_account_id, instagram_media_id);

create unique index if not exists
  instagram_comments_instagram_id_uidx
  on instagram_comments(instagram_comment_id);

create table if not exists instagram_comment_replies (
  id uuid primary key default gen_random_uuid(),
  instagram_comment_id uuid not null references instagram_comments(id) on delete cascade,
  instagram_reply_id text not null unique,
  reply_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Automation tables are created only if they do not already exist.
create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  instagram_account_id uuid not null references instagram_accounts(id) on delete cascade,
  name text not null,
  trigger_type text not null default 'any_comment'
    check (trigger_type in ('any_comment', 'keyword')),
  dm_enabled boolean not null default false,
  dm_text text,
  public_reply_enabled boolean not null default false,
  public_reply_text text,
  is_active boolean not null default true,
  total_comments integer not null default 0,
  total_dms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists automations
  add column if not exists instagram_account_id uuid;

alter table if exists automations
  add column if not exists name text;

alter table if exists automations
  add column if not exists trigger_type text default 'any_comment';

alter table if exists automations
  add column if not exists dm_enabled boolean default false;

alter table if exists automations
  add column if not exists dm_text text;

alter table if exists automations
  add column if not exists public_reply_enabled boolean default false;

alter table if exists automations
  add column if not exists public_reply_text text;

alter table if exists automations
  add column if not exists is_active boolean default true;

alter table if exists automations
  add column if not exists total_comments integer default 0;

alter table if exists automations
  add column if not exists total_dms integer default 0;

alter table if exists automations
  add column if not exists created_at timestamptz default now();

alter table if exists automations
  add column if not exists updated_at timestamptz default now();

create table if not exists automation_posts (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  instagram_post_id uuid not null references instagram_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists automation_keywords (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  keyword text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists
  automation_posts_unique_uidx
  on automation_posts(automation_id, instagram_post_id);

create unique index if not exists
  automation_keywords_unique_uidx
  on automation_keywords(automation_id, keyword);

-- Basic automation event log.
create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  instagram_account_id uuid references instagram_accounts(id) on delete cascade,
  automation_id uuid references automations(id) on delete set null,
  instagram_post_id uuid references instagram_posts(id) on delete set null,
  event_type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Inbox
create table if not exists instagram_conversations (
  id uuid primary key default gen_random_uuid(),
  instagram_account_id uuid not null references instagram_accounts(id) on delete cascade,
  instagram_scoped_user_id text not null,
  username text,
  last_message_at timestamptz,
  last_message_text text,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instagram_account_id, instagram_scoped_user_id)
);

alter table if exists instagram_conversations
  add column if not exists username text;

alter table if exists instagram_conversations
  add column if not exists last_message_at timestamptz;

alter table if exists instagram_conversations
  add column if not exists last_message_text text;

alter table if exists instagram_conversations
  add column if not exists unread_count integer not null default 0;

alter table if exists instagram_conversations
  add column if not exists created_at timestamptz not null default now();

alter table if exists instagram_conversations
  add column if not exists updated_at timestamptz not null default now();

create table if not exists instagram_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references instagram_conversations(id) on delete cascade,
  instagram_message_id text unique,
  direction text not null default 'inbound',
  message_text text,
  sent_at timestamptz not null default now(),
  raw_payload jsonb
);

alter table if exists instagram_messages
  add column if not exists instagram_message_id text;

alter table if exists instagram_messages
  add column if not exists direction text default 'inbound';

alter table if exists instagram_messages
  add column if not exists message_text text;

alter table if exists instagram_messages
  add column if not exists sent_at timestamptz default now();

alter table if exists instagram_messages
  add column if not exists raw_payload jsonb;

-- Indexes
create index if not exists
  instagram_comments_post_created_idx
  on instagram_comments(instagram_post_id, created_at);

create index if not exists
  instagram_messages_conversation_sent_idx
  on instagram_messages(conversation_id, sent_at);

create index if not exists
  instagram_conversations_account_last_message_idx
  on instagram_conversations(instagram_account_id, last_message_at desc);

create index if not exists
  automations_account_active_idx
  on automations(instagram_account_id, is_active);

create index if not exists
  analytics_events_account_created_idx
  on analytics_events(instagram_account_id, created_at desc);


-- ============================================================
-- Public comment reply rotation
-- ============================================================
-- Stores every configured public reply so duplication and editing preserve
-- the complete rotation, not only the legacy first reply.
alter table if exists instagram_automations
  add column if not exists reply_texts jsonb not null default '[]'::jsonb;

-- ============================================================
-- Link-click follow-up automation
-- ============================================================
-- A follow-up is only sent when a tracked DM link/button was not clicked.
-- The click is recorded by our redirect endpoint before the user reaches
-- the configured destination URL.

alter table if exists instagram_automations
  add column if not exists followup_enabled boolean not null default false;

alter table if exists instagram_automations
  add column if not exists followup_delay_minutes integer not null default 360;

alter table if exists instagram_automations
  add column if not exists followup_message text;

create table if not exists instagram_automation_link_clicks (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references instagram_automations(id) on delete cascade,
  recipient_instagram_id text not null,
  target_url text not null,
  token text not null unique,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists instagram_automation_link_clicks_automation_idx
  on instagram_automation_link_clicks(automation_id);

create index if not exists instagram_automation_link_clicks_token_idx
  on instagram_automation_link_clicks(token);

create table if not exists instagram_automation_followups (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references instagram_automations(id) on delete cascade,
  link_click_id uuid not null references instagram_automation_link_clicks(id) on delete cascade,
  recipient_instagram_id text not null,
  followup_message text not null,
  due_at timestamptz not null,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists instagram_automation_followups_link_uidx
  on instagram_automation_followups(link_click_id);

create index if not exists instagram_automation_followups_due_idx
  on instagram_automation_followups(due_at)
  where sent_at is null and failed_at is null;

alter table if exists instagram_automation_followups
  add column if not exists processing_at timestamptz;

alter table if exists instagram_automation_followups
  add column if not exists attempts integer not null default 0;

create index if not exists instagram_automation_followups_processing_idx
  on instagram_automation_followups(processing_at);


-- ============================================================
-- Scheduler: multi-media + Google Drive
-- ============================================================
-- media_items stores the complete media list for a scheduled post.
-- Example:
-- [
--   {"url":"https://.../1.jpg","type":"image","source":"upload"},
--   {"url":"https://.../2.jpg","type":"image","source":"upload"}
-- ]
--
-- For Google Drive videos, the application stores a public Drive URL
-- and converts common sharing URLs into a direct-download URL at publish time.

create table if not exists scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instagram_account_id uuid not null references instagram_accounts(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  media_items jsonb not null default '[]'::jsonb,
  post_type text not null check (post_type in ('post', 'reel')),
  caption text,
  scheduled_at timestamptz not null,
  timezone text,
  automation_enabled boolean not null default false,
  automation_id uuid,
  status text not null default 'scheduled' check (status in ('scheduled','publishing','published','failed','cancelled')),
  instagram_media_id text,
  published_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

alter table if exists scheduled_posts
  add column if not exists media_items jsonb not null default '[]'::jsonb;

create index if not exists scheduled_posts_due_idx
  on scheduled_posts(scheduled_at, status);

create index if not exists scheduled_posts_user_idx
  on scheduled_posts(user_id, scheduled_at desc);

create index if not exists scheduled_posts_account_idx
  on scheduled_posts(instagram_account_id, scheduled_at desc);

-- Backfill legacy single-media rows into the new media_items field.
update scheduled_posts
set media_items = jsonb_build_array(
  jsonb_build_object(
    'url', media_url,
    'type', media_type,
    'source', 'upload'
  )
)
where (media_items is null or jsonb_array_length(media_items) = 0)
  and media_url is not null;

-- ============================================================
-- Supabase scheduler helper
-- ============================================================
-- pg_cron + pg_net can call the protected Next.js endpoints every minute.
-- Replace the two placeholders before running this block.
--
-- IMPORTANT: Vercel Hobby cron is not used for these two jobs.
--
-- select cron.schedule(
--   'devilx-scheduled-posts',
--   '* * * * *',
--   $$ select net.http_get(
--        url := 'https://YOUR_DOMAIN.com/api/cron/scheduled-posts',
--        headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
--      ); $$
-- );
--
-- select cron.schedule(
--   'devilx-instagram-followups',
--   '* * * * *',
--   $$ select net.http_get(
--        url := 'https://YOUR_DOMAIN.com/api/cron/instagram-followups',
--        headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
--      ); $$
-- );
