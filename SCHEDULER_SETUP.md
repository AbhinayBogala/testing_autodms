# DevilX Scheduler Setup

This version supports:

- Single image Instagram posts
- Multi-image carousel posts (2–10 images)
- Single-video Reels
- Automatic Post/Reel mode from the selected media
- Google Drive public-link videos for scheduled Reels
- Supabase minute-level scheduling for scheduled posts and link-followups
- No 15-minute Vercel Hobby Cron dependency for these two jobs

## 1. Run the database migration

Run `supabase-migration.sql` in the Supabase SQL Editor.

It adds the `scheduled_posts.media_items` JSONB field and backfills existing single-media rows.

## 2. Environment variable

Set:

```env
CRON_SECRET=use-a-long-random-secret
```

The same value is used by Supabase `pg_cron` when it calls the protected Next.js cron endpoints.

## 3. Vercel

Do not add the follow-up or scheduled-post cron to `vercel.json` on a Vercel Hobby plan.

The project keeps only the daily Instagram sync cron there.

## 4. Enable Supabase extensions

Run:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

## 5. Schedule both jobs every minute

Replace `YOUR_DOMAIN` and `YOUR_CRON_SECRET`, then run:

```sql
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
```

If you already created jobs with these names, remove them first:

```sql
select cron.unschedule('devilx-scheduled-posts');
select cron.unschedule('devilx-instagram-followups');
```

## 6. Google Drive videos

In Scheduler, choose **Google Drive Video** and paste a Drive sharing link.

The Drive file must be:

**Anyone with the link → Viewer**

DevilX converts common Drive sharing links to:

```text
https://drive.google.com/uc?export=download&id=FILE_ID
```

At publish time the Instagram API receives that public URL.

### Important Google Drive limitation

Google Drive is not a dedicated media CDN. Very large files can sometimes return a confirmation/scan page instead of the raw video bytes. If Instagram cannot fetch the direct Drive URL, the Reel will fail. For production reliability, a public object-storage/CDN URL is preferable for large videos.

## 7. Carousel behavior

- 1 image → normal Instagram Post
- 2–10 images → Instagram Carousel Post
- 1 video → Instagram Reel
- More than 1 video → rejected
- Image + video → rejected

The UI automatically changes the Post/Reel state from the selected media; users do not manually choose an incompatible format.
