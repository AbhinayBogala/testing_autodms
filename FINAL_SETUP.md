# Auto DM - Final MVP Setup

This version is wired as a single-account ManyChat-style Instagram automation MVP.

## 1. Install

```bash
npm install
npm run dev
```

Do not copy `node_modules` or `.next` from another computer.

## 2. Environment

Copy `.env.example` to `.env.local`.

Fill:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=http://localhost:3000/api/instagram/oauth/callback
INSTAGRAM_API_VERSION=v26.0

INSTAGRAM_WEBHOOK_VERIFY_TOKEN=
CRON_SECRET=

NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Generate your own random values for the two webhook/cron secrets.

Never paste an Instagram access token into the frontend.

## 3. Supabase

Run `supabase-migration.sql` once.

The migration is additive and also adds the missing `sent_at` field to an existing `instagram_messages` table.

## 4. Meta

The app uses Instagram Login with the current `instagram_business_*` permission names.

Configure the OAuth redirect URI to exactly match:

```text
http://localhost:3000/api/instagram/oauth/callback
```

For production, use the exact HTTPS production callback.

The webhook URL is:

```text
https://YOUR-DOMAIN/api/instagram/webhook
```

The Meta webhook verification token must exactly match:

```env
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=...
```

The application also subscribes the connected Instagram account to `comments,messages` after OAuth.

## 5. Test sequence

### Connection

1. Login.
2. Click Connect Instagram.
3. Complete Meta authorization.
4. Return to Dashboard.
5. Confirm username/profile/follower stats.
6. Confirm `instagram_accounts.is_connected = true`.
7. Confirm `token_expires_at` is in the future.
8. Confirm webhook status.

### Sync

1. Click Sync Instagram.
2. Confirm posts appear.
3. The sync also fetches comments and recursive replies.
4. The success message shows posts, comments and replies.

### Threaded comments

1. Click a synced post.
2. The popup shows the post on the left and comments on the right.
3. Replies are indented under the parent.
4. Click Reply.
5. Send a reply.
6. The reply is stored as a child comment and displayed immediately.

### Automations

1. Open Automations from the sidebar.
2. If Instagram is connected, the page loads independently.
3. Choose:
   - Any comment, or
   - Specific keyword(s).
4. Select specific posts, or leave all posts unchecked to match every post.
5. Enable a public reply and/or private DM.
6. Create the automation.
7. Turn it on/off.
8. Edit it.
9. Duplicate it.
10. Delete it.

### Real-time automation

A new Instagram comment is received by:

```text
Meta
  -> /api/instagram/webhook
  -> instagram_comments
  -> automation matching
  -> public reply
  -> private reply
  -> analytics event
```

An automation with no selected posts means all posts.

### Inbox

When a customer sends a DM:

```text
Meta
  -> /api/instagram/webhook
  -> instagram_conversations
  -> instagram_messages
  -> Inbox
```

## 6. Token lifecycle

Long-lived Instagram tokens are not permanent. The server stores expiry information and attempts refresh before expiry.

If Meta has already invalidated the token, reconnect through OAuth.

## 7. Important production requirements

- Rotate any credentials that were previously exposed.
- Do not commit `.env.local`.
- Use HTTPS for production OAuth and webhooks.
- Configure Meta App Review/Advanced Access as required for accounts outside your own/test users.
- Test webhook events with the actual Instagram Professional account.
- Do not expose `SUPABASE_SECRET_KEY` or `INSTAGRAM_APP_SECRET` to client code.

## 8. Architecture

```text
Dashboard
  |
  +-- Instagram OAuth
  |      |
  |      +-- long-lived token
  |      +-- webhook subscription
  |
  +-- Sync
  |      +-- posts
  |      +-- comments
  |      +-- replies
  |
  +-- Post popup
  |      +-- threaded comments
  |      +-- public replies
  |
  +-- Automations
  |      +-- any comment
  |      +-- keyword
  |      +-- selected post
  |      +-- all posts
  |      +-- public reply
  |      +-- private reply
  |      +-- on/off
  |      +-- edit
  |      +-- duplicate
  |
  +-- Webhook
         +-- comments
         +-- messages
         +-- automation execution
         +-- inbox storage
```
