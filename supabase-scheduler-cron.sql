-- DevilX: run scheduled posts + Instagram follow-ups every minute on Supabase.
-- Replace both placeholders before executing.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- If these jobs already exist, uncomment and run:
-- select cron.unschedule('devilx-scheduled-posts');
-- select cron.unschedule('devilx-instagram-followups');

select cron.schedule(
  'devilx-scheduled-posts',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://YOUR_DOMAIN.com/api/cron/scheduled-posts',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer YOUR_CRON_SECRET'
    )
  );
  $$
);

select cron.schedule(
  'devilx-instagram-followups',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://YOUR_DOMAIN.com/api/cron/instagram-followups',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer YOUR_CRON_SECRET'
    )
  );
  $$
);
