# Link Follow-Up Setup

The automation follow-up feature sends one reminder when a tracked DM button link is not clicked.

## 1. Run the Supabase migration

Open Supabase SQL Editor and run the complete `supabase-migration.sql` file. The migration adds:

- `followup_enabled`
- `followup_delay_minutes`
- `followup_message`
- `instagram_automation_link_clicks`
- `instagram_automation_followups`

## 2. Configure the public app URL

Set this environment variable in local development and Vercel:

`NEXT_PUBLIC_APP_URL=https://your-production-domain.com`

The app also falls back to Vercel's production URL variables when available, but explicitly setting `NEXT_PUBLIC_APP_URL` is recommended.

## 3. How click tracking works

When follow-up is enabled, the Custom DM Button URL is converted into a secure tracking redirect owned by the app. The redirect records the click and then immediately sends the user to the original URL.

A follow-up is created only after the original DM is successfully sent. At the due time, the follow-up cron checks the click record. If the link was clicked, no reminder is sent. If it was not clicked, one reminder DM is sent.

## 4. Important limitation

Instagram does not provide a reliable generic webhook telling the app that a recipient opened or clicked an arbitrary external URL. Therefore, this implementation tracks clicks through the Custom DM Button URL. It does not claim that a person merely opened the DM.

The UI intentionally limits the reminder delay to 23 hours so the reminder can normally remain inside the Instagram messaging window. Meta may still reject a message depending on the account's current messaging eligibility and policy rules.

## 5. Cron

The follow-up endpoint is no longer scheduled through Vercel Hobby.

Use Supabase `pg_cron` + `pg_net` to call `/api/cron/instagram-followups` every minute. See `SCHEDULER_SETUP.md` for the exact SQL.

The endpoint is protected by the `CRON_SECRET` bearer token.
