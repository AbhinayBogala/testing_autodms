import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { graphUrl, readJson } from "@/lib/instagram";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  try {
    const { data: followups, error } = await admin
      .from("instagram_automation_followups")
      .select(`
        id,
        automation_id,
        link_click_id,
        recipient_instagram_id,
        followup_message,
        due_at,
        processing_at,
        attempts,
        instagram_automations!inner(
          is_active,
          instagram_account_id
        )
      `)
      .lte("due_at", now)
      .is("sent_at", null)
      .is("failed_at", null)
      .or(`processing_at.is.null,processing_at.lt.${new Date(Date.now() - 10 * 60 * 1000).toISOString()}`)
      .order("due_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const followup of followups ?? []) {
      try {
        const { data: claimedRows, error: claimError } = await admin
          .from("instagram_automation_followups")
          .update({
            processing_at: now,
            attempts: Number(followup.attempts ?? 0) + 1,
          })
          .eq("id", followup.id)
          .is("sent_at", null)
          .is("failed_at", null)
          .or(`processing_at.is.null,processing_at.lt.${new Date(Date.now() - 10 * 60 * 1000).toISOString()}`)
          .select("id");

        if (claimError || !claimedRows?.length) {
          if (claimError) console.error("FOLLOW-UP CLAIM ERROR:", followup.id, claimError);
          continue;
        }

        const automation = Array.isArray(followup.instagram_automations)
          ? followup.instagram_automations[0]
          : followup.instagram_automations;

        if (!automation?.is_active) {
          skipped++;
          await admin
            .from("instagram_automation_followups")
            .update({ failed_at: now, processing_at: null, last_error: "Automation is inactive." })
            .eq("id", followup.id);
          continue;
        }

        const { data: click } = await admin
          .from("instagram_automation_link_clicks")
          .select("clicked_at")
          .eq("id", followup.link_click_id)
          .maybeSingle();

        if (click?.clicked_at) {
          skipped++;
          await admin
            .from("instagram_automation_followups")
            .update({ sent_at: now, processing_at: null })
            .eq("id", followup.id);
          continue;
        }

        const { data: account, error: accountError } = await admin
          .from("instagram_accounts")
          .select("access_token, is_connected, instagram_user_id")
          .eq("id", automation.instagram_account_id)
          .maybeSingle();

        if (accountError || !account?.access_token || !account.is_connected) {
          throw new Error(accountError?.message ?? "Instagram account is not connected.");
        }

        const response = await fetch(
          graphUrl(`${account.instagram_user_id}/messages`),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipient: { id: followup.recipient_instagram_id },
              message: { text: followup.followup_message },
            }),
            cache: "no-store",
          },
        );

        const data = await readJson(response);

        if (!response.ok || !(data?.message_id || data?.id)) {
          throw new Error(
            typeof data?.error?.message === "string"
              ? data.error.message
              : "Instagram rejected the follow-up message.",
          );
        }

        await admin
          .from("instagram_automation_followups")
          .update({ sent_at: now, processing_at: null, last_error: null })
          .eq("id", followup.id);

        sent++;
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : "Follow-up failed.";
        console.error("INSTAGRAM FOLLOW-UP SEND ERROR:", followup.id, message);
        await admin
          .from("instagram_automation_followups")
          .update({ failed_at: now, processing_at: null, last_error: message })
          .eq("id", followup.id);
      }
    }

    return NextResponse.json({
      success: true,
      checked: followups?.length ?? 0,
      sent,
      skipped,
      failed,
    });
  } catch (error) {
    console.error("INSTAGRAM FOLLOW-UP CRON ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Follow-up cron failed.",
      },
      { status: 500 },
    );
  }
}
