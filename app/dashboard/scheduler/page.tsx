import { createClient } from "@/lib/supabase/server";

import SchedulerClient from "./SchedulerClient";

export default async function SchedulerPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-[#050505] p-4 text-white sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold">
          Scheduler
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Please connect your Instagram account first.
        </p>
      </main>
    );
  }

  /*
   * ==========================================================
   * INSTAGRAM ACCOUNTS
   * ==========================================================
   */

  const {
    data: accounts,
    error: accountsError,
  } = await supabase
    .from("instagram_accounts")
    .select(
      `
      id,
      username,
      is_connected
      `
    )
    .eq("user_id", user.id)
    .eq("is_connected", true)
    .order("connected_at", {
      ascending: false,
      nullsFirst: false,
    });

  if (accountsError) {
    console.error(
      "SCHEDULER ACCOUNTS ERROR:",
      accountsError
    );
  }

  /*
   * ==========================================================
   * SCHEDULED POSTS
   * ==========================================================
   */

  const {
    data: scheduledPosts,
    error: postsError,
  } = await supabase
    .from("scheduled_posts")
    .select(
      `
      id,
      instagram_account_id,
      media_url,
      media_type,
      media_items,
      post_type,
      caption,
      scheduled_at,
      timezone,
      automation_enabled,
      automation_id,
      status,
      instagram_media_id,
      published_at,
      error_message,
      created_at
      `
    )
    .eq("user_id", user.id)
    .order("scheduled_at", {
      ascending: true,
    });

  if (postsError) {
    console.error(
      "SCHEDULED POSTS ERROR:",
      postsError
    );
  }

  /*
   * ==========================================================
   * AUTOMATIONS
   * ==========================================================
   *
   * THIS IS THE IMPORTANT PART.
   *
   * We explicitly select "name".
   */

  const {
    data: automations,
    error: automationsError,
  } = await supabase
    .from("instagram_automations")
    .select(
      `
      id,
      name,
      instagram_account_id,
      instagram_post_id,
      trigger_type,
      trigger_keywords,
      trigger_keyword,
      dm_message,
      reply_enabled,
      reply_text,
      reply_texts,
      button_name,
      button_url,
      followup_enabled,
      followup_delay_minutes,
      followup_message,
      is_active
      `
    )
    .eq("user_id", user.id)
    .order("created_at", {
      ascending: false,
    });

  if (automationsError) {
    console.error(
      "SCHEDULER AUTOMATIONS ERROR:",
      automationsError
    );
  }

  /*
   * ==========================================================
   * SEND EVERYTHING TO CLIENT
   * ==========================================================
   */

  return (
    <SchedulerClient
      accounts={accounts ?? []}
      scheduledPosts={scheduledPosts ?? []}
      automations={automations ?? []}
    />
  );
}