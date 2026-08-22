-- ============================================================
-- AUTO DM - SAFE ADDITIVE MIGRATION
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
