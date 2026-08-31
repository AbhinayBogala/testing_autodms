# DevilX — Instagram Automation MVP

This project is a single-account Instagram automation MVP designed as the foundation for a ManyChat-style product.

## Included

- Supabase email/password login
- Instagram Business Login OAuth
- CSRF-protected OAuth state
- Short-lived → long-lived Instagram token exchange
- Stored token expiry and issued-at timestamps
- Automatic long-lived token refresh
- Vercel cron refresh job
- Automatic Instagram webhook subscription for `comments,messages`
- Instagram profile stats
- Post sync
- Comment sync with pagination
- Recursive threaded comment/reply sync
- Dashboard threaded comment popup
- Public comment replies
- Private replies from comment automations
- Keyword and any-comment triggers
- Specific-post targeting or all-post targeting
- Automation create/edit/duplicate/on-off/delete
- Basic automation analytics
- Instagram inbound message storage
- Inbox view
- Content view
- Comments view
- Analytics view
- Settings / connection status

## Meta flow

The application uses Instagram Business Login with the `instagram_business_*` permissions. The authorization code is exchanged for a short-lived token, then the server exchanges that token for a long-lived token. Long-lived tokens are refreshed before expiry when possible; if a token is already expired or otherwise invalid, the user is sent through OAuth again.

Meta's current Instagram API documentation identifies `graph.instagram.com` as the host for Instagram Login and documents the `comments` and messaging capabilities used here. See the current Meta Instagram API collection before changing permissions or API versions.

## Required Supabase migration

Run `supabase-migration.sql` in the Supabase SQL Editor before using the updated project.

The migration adds token lifecycle fields, webhook status, threaded comment fields, reply history, and inbox tables.

## Environment

Copy `.env.example` to `.env.local` and fill in the values. Never commit `.env.local`.

Required server secrets:

- `SUPABASE_SECRET_KEY`
- `INSTAGRAM_APP_SECRET`
- `CRON_SECRET`

Required public values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_REDIRECT_URI`
- `INSTAGRAM_API_VERSION`
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
- `NEXT_PUBLIC_SITE_URL`

## Meta App configuration

The redirect URI must exactly match `INSTAGRAM_REDIRECT_URI` in the Meta app.

The Instagram Login permissions used by this project are:

- `instagram_business_basic`
- `instagram_business_manage_messages`
- `instagram_business_manage_comments`

Configure the Webhooks product and use:

`/api/instagram/webhook`

The verification token must match `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.

## Local verification

```bash
npm install
npm run lint
npx tsc --noEmit
npm run dev
```

Then:

1. Create/login to the DevilX account.
2. Connect Instagram.
3. Confirm the account row in `instagram_accounts` has a new long-lived token and expiry.
4. Click Sync Instagram.
5. Add a comment to a synced post.
6. Confirm the webhook receives the comment.
7. Confirm the comment appears in the dashboard.
8. Test a public reply.
9. Test a keyword automation.
10. Test an any-comment automation.
11. Test a duplicated automation and its on/off switch.
12. Test an Instagram DM and confirm it appears in Inbox.

## Important security action

The original uploaded project contained live-looking Supabase and Meta credentials in `.env.local`. Those credentials should be rotated in Supabase/Meta before this project is used anywhere outside local testing. The final project intentionally does not include `.env.local`.


## Final setup

See `FINAL_SETUP.md` for the exact connection, Supabase, Meta, webhook, sync, threaded-comment, and automation test sequence.
