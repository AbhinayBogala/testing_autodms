import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  graphUrl,
  readJson,
  refreshAccountIfNeeded,
} from "@/lib/instagram";

type FollowupRow = {
  id: string;
  automation_id: string;
  link_click_id: string;
  recipient_instagram_id: string;
  followup_message: string;
  due_at: string;
  processing_at: string | null;
  attempts: number | null;
  instagram_automations:
    | {
        is_active: boolean;
        instagram_account_id: string;
      }
    | {
        is_active: boolean;
        instagram_account_id: string;
      }[]
    | null;
};

type InstagramAccount = {
  id: string;
  instagram_user_id: string;
  access_token: string | null;
  token_issued_at?: string | null;
  token_expires_at?: string | null;
  is_connected: boolean;
};

/* =========================================================
   SEND FOLLOW-UP DM
========================================================= */

async function sendFollowupMessage({
  instagramUserId,
  accessToken,
  recipientInstagramId,
  message,
}: {
  instagramUserId: string;
  accessToken: string;
  recipientInstagramId: string;
  message: string;
}) {
  const url = graphUrl(`${instagramUserId}/messages`);

  console.log("FOLLOW-UP DM ENDPOINT:", url);

  console.log("FOLLOW-UP RECIPIENT:", {
    recipientInstagramId,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: {
        id: recipientInstagramId,
      },
      message: {
        text: message,
      },
    }),
    cache: "no-store",
  });

  const data = await readJson(response);

  console.log("FOLLOW-UP INSTAGRAM API RESPONSE:", {
    status: response.status,
    ok: response.ok,
    data,
  });

  return {
    ok:
      response.ok &&
      Boolean(data?.message_id || data?.id),
    data,
  };
}

/* =========================================================
   CRON
========================================================= */

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  const nowDate = new Date();
  const now = nowDate.toISOString();

  /*
   * A processing lock older than 10 minutes is considered stale.
   */
  const staleProcessingTime = new Date(
    Date.now() - 10 * 60 * 1000,
  ).toISOString();

  try {
    /* =====================================================
       1. FIND DUE FOLLOW-UPS
    ===================================================== */

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
      .or(
        `processing_at.is.null,processing_at.lt.${staleProcessingTime}`,
      )
      .order("due_at", {
        ascending: true,
      })
      .limit(100);

    if (error) {
      throw error;
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    /* =====================================================
       2. PROCESS EACH FOLLOW-UP
    ===================================================== */

    for (const followup of (followups ?? []) as FollowupRow[]) {
      try {
        /* =================================================
           2A. CLAIM FOLLOW-UP
        ================================================= */

        const { data: claimedRows, error: claimError } =
          await admin
            .from("instagram_automation_followups")
            .update({
              processing_at: now,
              attempts:
                Number(followup.attempts ?? 0) + 1,
            })
            .eq("id", followup.id)
            .is("sent_at", null)
            .is("failed_at", null)
            .or(
              `processing_at.is.null,processing_at.lt.${staleProcessingTime}`,
            )
            .select("id");

        if (claimError) {
          console.error(
            "FOLLOW-UP CLAIM ERROR:",
            followup.id,
            claimError,
          );

          continue;
        }

        if (!claimedRows?.length) {
          console.log(
            "FOLLOW-UP ALREADY CLAIMED:",
            followup.id,
          );

          continue;
        }

        /* =================================================
           2B. GET AUTOMATION
        ================================================= */

        const automation = Array.isArray(
          followup.instagram_automations,
        )
          ? followup.instagram_automations[0]
          : followup.instagram_automations;

        if (!automation) {
          throw new Error(
            "Instagram automation record not found.",
          );
        }

        if (!automation.is_active) {
          skipped++;

          await admin
            .from("instagram_automation_followups")
            .update({
              failed_at: now,
              processing_at: null,
              last_error:
                "Automation is inactive.",
            })
            .eq("id", followup.id);

          continue;
        }

        /* =================================================
           2C. CHECK LINK CLICK
        ================================================= */

        const { data: click, error: clickError } =
          await admin
            .from("instagram_automation_link_clicks")
            .select("clicked_at")
            .eq("id", followup.link_click_id)
            .maybeSingle();

        if (clickError) {
          throw new Error(
            `Link click lookup failed: ${clickError.message}`,
          );
        }

        /*
         * IMPORTANT:
         *
         * If the user already clicked the tracked link,
         * we DO NOT send the follow-up.
         */

        if (click?.clicked_at) {
          console.log(
            "FOLLOW-UP SKIPPED - LINK ALREADY CLICKED:",
            {
              followupId: followup.id,
              linkClickId: followup.link_click_id,
              clickedAt: click.clicked_at,
            },
          );

          skipped++;

          await admin
            .from("instagram_automation_followups")
            .update({
              sent_at: now,
              processing_at: null,
              last_error: null,
            })
            .eq("id", followup.id);

          continue;
        }

        /* =================================================
           2D. GET INSTAGRAM ACCOUNT
        ================================================= */

        const {
          data: accountData,
          error: accountError,
        } = await admin
          .from("instagram_accounts")
          .select(`
            id,
            instagram_user_id,
            access_token,
            token_issued_at,
            token_expires_at,
            is_connected
          `)
          .eq(
            "id",
            automation.instagram_account_id,
          )
          .maybeSingle();

        if (accountError) {
          throw new Error(
            `Instagram account lookup failed: ${accountError.message}`,
          );
        }

        if (!accountData) {
          throw new Error(
            "Instagram account not found.",
          );
        }

        let account =
          accountData as InstagramAccount;

        if (!account.is_connected) {
          throw new Error(
            "Instagram account is not connected.",
          );
        }

        if (!account.access_token) {
          throw new Error(
            "Instagram access token is missing.",
          );
        }

        /* =================================================
           2E. REFRESH TOKEN IF NEEDED
        ================================================= */

        try {
          const refreshed =
            await refreshAccountIfNeeded(account);

          if (refreshed?.accessToken) {
            account = {
              ...account,
              access_token:
                refreshed.accessToken,
            };
          }
        } catch (refreshError) {
          console.warn(
            "FOLLOW-UP TOKEN REFRESH FAILED. USING EXISTING TOKEN:",
            refreshError,
          );
        }

        if (!account.access_token) {
          throw new Error(
            "Instagram access token is unavailable.",
          );
        }

        /* =================================================
           2F. VALIDATE RECIPIENT
        ================================================= */

        const recipientInstagramId =
          String(
            followup.recipient_instagram_id ?? "",
          ).trim();

        if (!recipientInstagramId) {
          throw new Error(
            "Follow-up recipient Instagram ID is missing.",
          );
        }

        const followupMessage =
          String(
            followup.followup_message ?? "",
          ).trim();

        if (!followupMessage) {
          throw new Error(
            "Follow-up message is empty.",
          );
        }

        console.log(
          "PREPARING FOLLOW-UP DM:",
          {
            followupId: followup.id,
            automationId:
              followup.automation_id,
            instagramUserId:
              account.instagram_user_id,
            recipientInstagramId,
            message:
              followupMessage,
          },
        );

        /* =================================================
           2G. SEND FOLLOW-UP
        ================================================= */

        const result =
          await sendFollowupMessage({
            instagramUserId:
              account.instagram_user_id,
            accessToken:
              account.access_token,
            recipientInstagramId,
            message:
              followupMessage,
          });

        if (!result.ok) {
          const instagramError =
            typeof result.data?.error?.message ===
            "string"
              ? result.data.error.message
              : "Instagram rejected the follow-up message.";

          throw new Error(
            instagramError,
          );
        }

        /* =================================================
           2H. MARK AS SENT
        ================================================= */

        const { error: sentUpdateError } =
          await admin
            .from("instagram_automation_followups")
            .update({
              sent_at: now,
              processing_at: null,
              failed_at: null,
              last_error: null,
            })
            .eq("id", followup.id);

        if (sentUpdateError) {
          console.error(
            "FOLLOW-UP SENT BUT DATABASE UPDATE FAILED:",
            followup.id,
            sentUpdateError,
          );

          /*
           * Instagram already received the message.
           * Do not report this as an Instagram send failure.
           */
        }

        sent++;

        console.log(
          "FOLLOW-UP SENT SUCCESSFULLY:",
          followup.id,
        );
      } catch (error) {
        failed++;

        const message =
          error instanceof Error
            ? error.message
            : "Follow-up failed.";

        console.error(
          "INSTAGRAM FOLLOW-UP SEND ERROR:",
          followup.id,
          message,
        );

        await admin
          .from("instagram_automation_followups")
          .update({
            failed_at: now,
            processing_at: null,
            last_error: message,
          })
          .eq("id", followup.id);
      }
    }

    /* =====================================================
       3. RESPONSE
    ===================================================== */

    return NextResponse.json({
      success: true,
      checked: followups?.length ?? 0,
      sent,
      skipped,
      failed,
    });
  } catch (error) {
    console.error(
      "INSTAGRAM FOLLOW-UP CRON ERROR:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Follow-up cron failed.",
      },
      {
        status: 500,
      },
    );
  }
}